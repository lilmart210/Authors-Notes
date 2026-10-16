// Resumable downloads with progress events and a hash check.
//
// A download streams into `<dest>.part`; if that file is already there (an earlier
// attempt was cancelled or cut off) it asks the server for the rest. The SHA-256 is
// computed while writing, and the file only gets its real name once it matches.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub const CANCELLED: &str = "cancelled";
const PROGRESS_EVERY: Duration = Duration::from_millis(200);

/// Running downloads by id, each with its cancel flag.
#[derive(Default)]
pub struct Downloads(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Clone, Serialize)]
struct Progress<'a> {
    id: &'a str,
    received: u64,
    total: u64,
}

pub struct Target<'a> {
    pub id: &'a str,
    pub url: &'a str,
    pub dest: &'a Path,
    pub sha256: Option<&'a str>,
    pub bytes: Option<u64>,
}

pub fn part_path(dest: &Path) -> PathBuf {
    let mut name = dest.as_os_str().to_owned();
    name.push(".part");
    PathBuf::from(name)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Download `target`, emitting `download-progress` events. Errors with
/// [`CANCELLED`] if [`cancel`] is called; the partial file is kept for a resume.
pub async fn fetch(app: &AppHandle, downloads: &Downloads, target: Target<'_>) -> Result<(), String> {
    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut running = downloads.0.lock().unwrap();
        if running.contains_key(target.id) {
            return Err("Already downloading".into());
        }
        running.insert(target.id.to_string(), flag.clone());
    }
    let result = fetch_inner(app, &flag, &target).await;
    downloads.0.lock().unwrap().remove(target.id);
    result
}

pub fn cancel(downloads: &Downloads, id: &str) {
    if let Some(flag) = downloads.0.lock().unwrap().get(id) {
        flag.store(true, Ordering::SeqCst);
    }
}

fn emit(app: &AppHandle, id: &str, received: u64, total: u64) {
    let _ = app.emit("download-progress", Progress { id, received, total });
}

async fn hash_file(path: &Path, hasher: &mut Sha256) -> Result<u64, String> {
    let mut file = tokio::fs::File::open(path).await.map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        let read = file.read(&mut buffer).await.map_err(|e| e.to_string())?;
        if read == 0 {
            return Ok(total);
        }
        hasher.update(&buffer[..read]);
        total += read as u64;
    }
}

async fn fetch_inner(app: &AppHandle, flag: &AtomicBool, target: &Target<'_>) -> Result<(), String> {
    if let Some(parent) = target.dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
    }
    let part = part_path(target.dest);
    let mut have = tokio::fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);
    let mut hasher = Sha256::new();

    let already_complete = have > 0 && target.bytes == Some(have);
    let mut received = have;
    if already_complete {
        hash_file(&part, &mut hasher).await?;
    } else {
        let client = reqwest::Client::builder()
            .user_agent(concat!("AuthorsNotes/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| e.to_string())?;
        let mut request = client.get(target.url);
        if have > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
        }
        let response = request.send().await.map_err(|e| format!("Couldn't reach the download: {e}"))?;
        let status = response.status();
        if !status.is_success() {
            if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                let _ = tokio::fs::remove_file(&part).await;
            }
            return Err(format!("The download failed ({status})"));
        }
        let resumed = status == reqwest::StatusCode::PARTIAL_CONTENT && have > 0;
        if !resumed {
            have = 0;
        }
        let total = response.content_length().map(|n| n + have).or(target.bytes).unwrap_or(0);
        let mut file = if resumed {
            hash_file(&part, &mut hasher).await?;
            tokio::fs::OpenOptions::new().append(true).open(&part).await.map_err(|e| e.to_string())?
        } else {
            tokio::fs::File::create(&part).await.map_err(|e| format!("Couldn't write {}: {e}", part.display()))?
        };
        received = have;
        emit(app, target.id, received, total);
        let mut last = Instant::now();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if flag.load(Ordering::SeqCst) {
                let _ = file.flush().await;
                return Err(CANCELLED.into());
            }
            let chunk = chunk.map_err(|e| format!("The download stopped: {e}"))?;
            hasher.update(&chunk);
            file.write_all(&chunk).await.map_err(|e| format!("Couldn't write the download: {e}"))?;
            received += chunk.len() as u64;
            if last.elapsed() >= PROGRESS_EVERY {
                emit(app, target.id, received, total);
                last = Instant::now();
            }
        }
        file.flush().await.map_err(|e| e.to_string())?;
        emit(app, target.id, received, total.max(received));
    }

    if let Some(bytes) = target.bytes {
        if received != bytes {
            let _ = tokio::fs::remove_file(&part).await;
            return Err("The download was incomplete; try again".into());
        }
    }
    if let Some(expected) = target.sha256 {
        if !hex(&hasher.finalize()).eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&part).await;
            return Err("The download was damaged; try again".into());
        }
    }
    if tokio::fs::metadata(target.dest).await.is_ok() {
        tokio::fs::remove_file(target.dest).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::rename(&part, target.dest).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_file_sits_beside_the_destination() {
        assert_eq!(part_path(Path::new("C:/models/a.gguf")), PathBuf::from("C:/models/a.gguf.part"));
    }

    #[test]
    fn hex_is_lowercase() {
        assert_eq!(hex(&[0x0a, 0xff]), "0aff");
    }
}
