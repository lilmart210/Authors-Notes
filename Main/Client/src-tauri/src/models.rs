// App-wide settings (settings.json in the app's config folder) and the models
// folder: list, download and remove GGUF model files. The folder can be anywhere,
// including a NAS share, so paths come from the settings rather than a fixed place.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::download::{self, Downloads, Target};

/// Model downloads may only come from these hosts (redirects to their CDNs are fine).
const MODEL_HOSTS: &[&str] = &["huggingface.co"];

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

pub fn default_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("models"))
}

pub fn read_settings(app: &AppHandle) -> Value {
    settings_path(app)
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}))
}

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Value {
    read_settings(&app)
}

#[tauri::command]
pub fn settings_set(app: AppHandle, settings: Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn models_default_dir(app: AppHandle) -> Result<String, String> {
    Ok(default_models_dir(&app)?.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct LocalModel {
    file: String,
    path: String,
    bytes: u64,
}

/// A bare file name: no folders, no `..`, so it can't point outside the models folder.
fn plain_file_name(file: &str) -> Result<&str, String> {
    let ok = !file.is_empty() && !file.contains(['/', '\\', ':']) && file != "." && file != "..";
    if ok { Ok(file) } else { Err(format!("Not a model file name: {file}")) }
}

fn is_model_file(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("gguf"))
}

/// Add a folder's model files to `found`; returns its subfolders when `keep_folders`.
fn scan(folder: &Path, prefix: &str, keep_folders: bool, found: &mut Vec<LocalModel>) -> Result<Vec<PathBuf>, String> {
    let mut subfolders = Vec::new();
    for entry in std::fs::read_dir(folder).map_err(|e| format!("Couldn't read {}: {e}", folder.display()))? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            if keep_folders {
                subfolders.push(path);
            }
        } else if is_model_file(&path) {
            let name = entry.file_name().to_string_lossy().into_owned();
            found.push(LocalModel {
                file: if prefix.is_empty() { name } else { format!("{prefix}/{name}") },
                path: path.to_string_lossy().into_owned(),
                bytes: meta.len(),
            });
        }
    }
    Ok(subfolders)
}

/// Every .gguf in the folder (and one level of subfolders, for hand-organised shares).
#[tauri::command]
pub fn models_list(dir: String) -> Result<Vec<LocalModel>, String> {
    let root = PathBuf::from(&dir);
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    for sub in scan(&root, "", true, &mut found)? {
        let prefix = sub.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let _ = scan(&sub, &prefix, false, &mut found);
    }
    found.sort_by(|a, b| a.file.to_lowercase().cmp(&b.file.to_lowercase()));
    Ok(found)
}

/// Remove a model (and any unfinished download of it) from the models folder.
#[tauri::command]
pub fn models_remove(dir: String, file: String) -> Result<(), String> {
    let mut path = PathBuf::from(&dir);
    for part in file.split('/') {
        path.push(plain_file_name(part)?);
    }
    if !is_model_file(&path) {
        return Err(format!("Not a model file: {file}"));
    }
    let _ = std::fs::remove_file(download::part_path(&path));
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Couldn't remove {file}: {e}")),
    }
}

fn allowed_model_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    MODEL_HOSTS.iter().any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

/// Download a model into the models folder. Resolves with the file's path.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn model_download(
    app: AppHandle,
    downloads: State<'_, Downloads>,
    dir: String,
    id: String,
    url: String,
    file: String,
    sha256: Option<String>,
    bytes: Option<u64>,
) -> Result<String, String> {
    if !allowed_model_url(&url) {
        return Err(format!("Models can't be downloaded from {url}"));
    }
    let dest = PathBuf::from(&dir).join(plain_file_name(&file)?);
    download::fetch(&app, &downloads, Target { id: &id, url: &url, dest: &dest, sha256: sha256.as_deref(), bytes }).await?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn download_cancel(downloads: State<'_, Downloads>, id: String) {
    download::cancel(&downloads, &id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_cannot_escape_the_folder() {
        assert!(plain_file_name("a.gguf").is_ok());
        assert!(plain_file_name("../a.gguf").is_err());
        assert!(plain_file_name("C:a.gguf").is_err());
        assert!(plain_file_name("sub\\a.gguf").is_err());
    }

    #[test]
    fn only_hugging_face_urls_are_allowed() {
        assert!(allowed_model_url("https://huggingface.co/bartowski/x/resolve/main/x.gguf"));
        assert!(!allowed_model_url("http://huggingface.co/x.gguf"));
        assert!(!allowed_model_url("https://huggingface.co.evil.com/x.gguf"));
        assert!(!allowed_model_url("https://example.com/huggingface.co/x.gguf"));
    }
}
