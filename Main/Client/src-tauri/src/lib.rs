mod components;
mod download;
mod llm;
mod models;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .manage(download::Downloads::default())
    .manage(llm::Servers::default())
    .manage(llm::Requests::default())
    .invoke_handler(tauri::generate_handler![
      models::settings_get,
      models::settings_set,
      models::models_default_dir,
      models::models_list,
      models::models_remove,
      models::model_download,
      models::download_cancel,
      components::component_status,
      components::component_install,
      components::pandoc_run,
      llm::llm_start,
      llm::llm_stop,
      llm::llm_request,
      llm::llm_cancel,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|handle, event| {
    // model servers are separate processes; don't leave them running
    if let RunEvent::Exit = event {
      llm::stop_all(&handle.state::<llm::Servers>());
    }
  });
}
