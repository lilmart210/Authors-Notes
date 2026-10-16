// Optional programs the app downloads on first use instead of bundling: the AI
// engine (llama.cpp's llama-server) and Pandoc. Each is a pinned release zip with
// a known SHA-256, unpacked into the app's local data folder.
//
// The URLs point at the projects' own release pages for now; switching to the
// author's server only means changing them here.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::download::{self, Downloads, Target};

pub struct Component {
    pub name: &'static str,
    pub version: &'static str,
    url: &'static str,
    sha256: &'static str,
    bytes: u64,
    /// The program to run, relative to the install folder.
    pub exe: &'static str,
    /// Only unpack zip entries whose file name is listed (flattened); empty = everything.
    only: &'static [&'static str],
}

pub const ENGINE: Component = Component {
    name: "engine",
    version: "b11678-vulkan-x64",
    url: "https://github.com/ggml-org/llama.cpp/releases/download/b11678/llama-b11678-bin-win-vulkan-x64.zip",
    sha256: "dad3ea8140d26a821ba113ad6e8cad13cc00065f995ce08bf3481c8f041d0e70",
    bytes: 32_210_140,
    exe: "llama-server.exe",
    only: &[],
};

pub const PANDOC: Component = Component {
    name: "pandoc",
    version: "3.10",
    url: "https://github.com/jgm/pandoc/releases/download/3.10/pandoc-3.10-windows-x86_64.zip",
    sha256: "bb808d00fd58762299d64582a9b4c3e4b106cd929e62c5f19bcdcb496f1e54ae",
    bytes: 41_440_900,
    exe: "pandoc.exe",
    only: &["pandoc.exe"],
};

fn component(name: &str) -> Result<&'static Component, String> {
    match name {
        "engine" => Ok(&ENGINE),
        "pandoc" => Ok(&PANDOC),
        _ => Err(format!("Unknown component: {name}")),
    }
}

fn install_dir(app: &AppHandle, component: &Component) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("components")
        .join(component.name)
        .join(component.version))
}

/// The installed program, if it's there.
pub fn exe_path(app: &AppHandle, component: &Component) -> Option<PathBuf> {
    let path = install_dir(app, component).ok()?.join(component.exe);
    path.is_file().then_some(path)
}

#[derive(Serialize)]
pub struct Status {
    installed: bool,
    version: &'static str,
    bytes: u64,
}

#[tauri::command]
pub fn component_status(app: AppHandle, name: String) -> Result<Status, String> {
    let component = component(&name)?;
    Ok(Status { installed: exe_path(&app, component).is_some(), version: component.version, bytes: component.bytes })
}

fn unzip(zip_path: &Path, dest: &Path, only: &[&str]) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Couldn't open the download: {e}"))?;
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(inner) = entry.enclosed_name() else { continue };
        let out = if only.is_empty() {
            dest.join(inner)
        } else {
            let Some(name) = inner.file_name().and_then(|n| n.to_str()) else { continue };
            if !only.iter().any(|wanted| wanted.eq_ignore_ascii_case(name)) {
                continue;
            }
            dest.join(name)
        };
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        std::fs::write(&out, bytes).map_err(|e| format!("Couldn't write {}: {e}", out.display()))?;
    }
    Ok(())
}

/// Download and unpack a component. Progress events use the component's name as id.
#[tauri::command]
pub async fn component_install(app: AppHandle, downloads: State<'_, Downloads>, name: String) -> Result<(), String> {
    let component = component(&name)?;
    if exe_path(&app, component).is_some() {
        return Ok(());
    }
    let dir = install_dir(&app, component)?;
    let parent = dir.parent().ok_or("No install folder")?.to_path_buf();
    let zip_path = parent.join(format!("{}.zip", component.version));
    download::fetch(
        &app,
        &downloads,
        Target { id: component.name, url: component.url, dest: &zip_path, sha256: Some(component.sha256), bytes: Some(component.bytes) },
    )
    .await?;
    // Unpack beside the final folder, then move it into place, so a half-unpacked
    // folder never looks installed.
    let staging = parent.join(format!("{}.unpacking", component.version));
    let only = component.only;
    let (zip_for_task, staging_for_task) = (zip_path.clone(), staging.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let _ = std::fs::remove_dir_all(&staging_for_task);
        unzip(&zip_for_task, &staging_for_task, only)
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::rename(&staging, &dir).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&zip_path);
    if exe_path(&app, component).is_none() {
        return Err(format!("{} wasn't in the download", component.exe));
    }
    Ok(())
}

#[cfg(windows)]
pub fn hide_console(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console(_command: &mut std::process::Command) {}

#[derive(Serialize)]
pub struct Output {
    code: i32,
    stdout: String,
    stderr: String,
}

/// Run Pandoc with these arguments and collect its output.
#[tauri::command]
pub async fn pandoc_run(app: AppHandle, args: Vec<String>) -> Result<Output, String> {
    let exe = exe_path(&app, &PANDOC).ok_or("Pandoc isn't installed")?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = std::process::Command::new(exe);
        command.args(&args).stdin(Stdio::null());
        hide_console(&mut command);
        let output = command.output().map_err(|e| format!("Pandoc couldn't start: {e}"))?;
        Ok(Output {
            code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
