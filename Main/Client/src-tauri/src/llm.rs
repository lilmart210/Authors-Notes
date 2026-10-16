// Local model servers: one llama-server process per model, on a free localhost
// port, started on demand and stopped when the app exits. Requests go through
// here (not straight from the page) and stream back over a Tauri channel.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use crate::components::{self, ENGINE};

/// Loading a big model from a NAS can take a while.
const START_TIMEOUT: Duration = Duration::from_secs(300);

struct Server {
    child: Child,
    port: u16,
    ctx: u32,
    /// Answered /health; until then a second caller waits instead of using it.
    ready: bool,
}

enum Existing {
    Ready(u16),
    Loading(u16),
}

#[derive(Default)]
pub struct Servers(Mutex<HashMap<String, Server>>);

/// In-flight requests by id, each with its cancel flag.
#[derive(Default)]
pub struct Requests(Mutex<HashMap<String, Arc<AtomicBool>>>);

fn free_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    Ok(listener.local_addr().map_err(|e| e.to_string())?.port())
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().no_proxy().build().map_err(|e| e.to_string())
}

fn log_path(app: &AppHandle, port: u16) -> Result<PathBuf, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("llama-server-{port}.log")))
}

fn log_tail(path: &PathBuf) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(4)..].join("\n")
}

/// This model's server, if it's still running and big enough (a dead or too-small
/// one is removed).
fn existing(servers: &Servers, model: &str, ctx: u32) -> Option<Existing> {
    let mut map = servers.0.lock().unwrap();
    let server = map.get_mut(model)?;
    let alive = matches!(server.child.try_wait(), Ok(None));
    if alive && server.ctx >= ctx {
        return Some(if server.ready { Existing::Ready(server.port) } else { Existing::Loading(server.port) });
    }
    if let Some(mut old) = map.remove(model) {
        let _ = old.child.kill();
    }
    None
}

fn spawn_server(app: &AppHandle, model: &str, ctx: u32) -> Result<(Child, u16), String> {
    let exe = components::exe_path(app, &ENGINE).ok_or("The AI engine isn't installed")?;
    if !PathBuf::from(model).is_file() {
        return Err(format!("The model file isn't there: {model}"));
    }
    let port = free_port()?;
    let log_file = std::fs::File::create(log_path(app, port)?).map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new(&exe);
    command
        .args(["-m", model, "--host", "127.0.0.1", "--port", &port.to_string(), "-c", &ctx.to_string()])
        // read the whole model into memory (safe over a network share), fit the rest to the machine
        .args(["--load-mode", "none", "--fit", "on", "--no-webui", "-np", "1"])
        .stdin(Stdio::null())
        .stdout(log_file.try_clone().map_err(|e| e.to_string())?)
        .stderr(log_file);
    if let Some(dir) = exe.parent() {
        command.current_dir(dir);
    }
    components::hide_console(&mut command);
    let child = command.spawn().map_err(|e| format!("The AI engine couldn't start: {e}"))?;
    Ok((child, port))
}

/// Start (or reuse) the server for a model. Resolves with its port once it answers;
/// a second caller while it's loading waits for the same server.
#[tauri::command]
pub async fn llm_start(app: AppHandle, servers: State<'_, Servers>, model: String, ctx: u32) -> Result<u16, String> {
    let port = match existing(&servers, &model, ctx) {
        Some(Existing::Ready(port)) => return Ok(port),
        Some(Existing::Loading(port)) => port,
        None => {
            let (child, port) = spawn_server(&app, &model, ctx)?;
            servers.0.lock().unwrap().insert(model.clone(), Server { child, port, ctx, ready: false });
            port
        }
    };
    let log = log_path(&app, port)?;
    let http = client()?;
    let started = Instant::now();
    loop {
        {
            let mut map = servers.0.lock().unwrap();
            let Some(server) = map.get_mut(&model) else { return Err("Stopped".into()) };
            if let Ok(Some(status)) = server.child.try_wait() {
                map.remove(&model);
                return Err(format!("The AI engine stopped ({status}).\n{}", log_tail(&log)));
            }
        }
        if let Ok(response) = http.get(format!("http://127.0.0.1:{port}/health")).send().await {
            if response.status().is_success() {
                if let Some(server) = servers.0.lock().unwrap().get_mut(&model) {
                    server.ready = true;
                }
                return Ok(port);
            }
        }
        if started.elapsed() > START_TIMEOUT {
            llm_stop(servers.clone(), model);
            return Err("The model took too long to load".into());
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}

#[tauri::command]
pub fn llm_stop(servers: State<'_, Servers>, model: String) {
    if let Some(mut server) = servers.0.lock().unwrap().remove(&model) {
        let _ = server.child.kill();
        let _ = server.child.wait();
    }
}

pub fn stop_all(servers: &Servers) {
    for (_, mut server) in servers.0.lock().unwrap().drain() {
        let _ = server.child.kill();
        let _ = server.child.wait();
    }
}

/// Split complete `data: {...}` lines off the front of a server-sent-events buffer.
fn drain_events(buffer: &mut Vec<u8>) -> Vec<Value> {
    let mut events = Vec::new();
    while let Some(end) = buffer.iter().position(|&b| b == b'\n') {
        let line: Vec<u8> = buffer.drain(..=end).collect();
        let line = String::from_utf8_lossy(&line);
        let Some(data) = line.trim().strip_prefix("data:") else { continue };
        let data = data.trim();
        if data == "[DONE]" {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(data) {
            events.push(value);
        }
    }
    events
}

/// POST to a model server. With `"stream": true` in the body, each event is sent
/// on `on_event` as it arrives; otherwise the one JSON reply is.
#[tauri::command]
pub async fn llm_request(
    requests: State<'_, Requests>,
    request_id: String,
    port: u16,
    path: String,
    body: Value,
    on_event: Channel<Value>,
) -> Result<(), String> {
    let flag = Arc::new(AtomicBool::new(false));
    requests.0.lock().unwrap().insert(request_id.clone(), flag.clone());
    let result = async {
        let response = client()?
            .post(format!("http://127.0.0.1:{port}{path}"))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("The AI engine didn't answer: {e}"))?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("The AI engine refused the request ({status}): {}", text.chars().take(300).collect::<String>()));
        }
        if !body.get("stream").and_then(Value::as_bool).unwrap_or(false) {
            let value: Value = response.json().await.map_err(|e| e.to_string())?;
            return on_event.send(value).map_err(|e| e.to_string());
        }
        let mut buffer = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if flag.load(Ordering::SeqCst) {
                break; // dropping the response closes the connection, which stops generation
            }
            buffer.extend_from_slice(&chunk.map_err(|e| e.to_string())?);
            for event in drain_events(&mut buffer) {
                on_event.send(event).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    .await;
    requests.0.lock().unwrap().remove(&request_id);
    result
}

#[tauri::command]
pub fn llm_cancel(requests: State<'_, Requests>, request_id: String) {
    if let Some(flag) = requests.0.lock().unwrap().get(&request_id) {
        flag.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_split_on_complete_lines_only() {
        let mut buffer = b"data: {\"content\":\"Hel\"}\n\ndata: {\"content\":\"lo\"}\ndata: {\"cont".to_vec();
        let events = drain_events(&mut buffer);
        assert_eq!(events.len(), 2);
        assert_eq!(events[1]["content"], "lo");
        assert_eq!(buffer, b"data: {\"cont".to_vec());
    }

    #[test]
    fn done_marker_and_other_lines_are_skipped() {
        let mut buffer = b": ping\nevent: x\ndata: [DONE]\n".to_vec();
        assert!(drain_events(&mut buffer).is_empty());
    }

    #[test]
    fn multibyte_text_split_across_chunks_survives() {
        let text = "data: {\"content\":\"\u{2014}\"}\n".as_bytes().to_vec();
        let (first, second) = text.split_at(22);
        let mut buffer = first.to_vec();
        assert!(drain_events(&mut buffer).is_empty());
        buffer.extend_from_slice(second);
        assert_eq!(drain_events(&mut buffer)[0]["content"], "\u{2014}");
    }
}
