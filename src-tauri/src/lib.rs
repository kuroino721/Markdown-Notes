pub mod auth;
pub mod notes;

use notes::{Note, NotesStore};
use tauri::image::Image;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn create_note(app: tauri::AppHandle) -> Result<Note, String> {
    log::info!("Command: create_note called");
    let mut store = NotesStore::load(&app);
    let note = Note::new();
    store.add_note(note.clone());
    store.save(&app)?;

    // Temporarily disabled window creation to test
    // let note_id = note.id.clone();
    // let url = WebviewUrl::App(format!("note.html?id={}", note_id).into());
    // let _window = WebviewWindowBuilder::new(&app, &note_id, url)
    //     .title("ノート")
    //     .inner_size(300.0, 400.0)
    //     .position(note.window_state.x as f64, note.window_state.y as f64)
    //     .decorations(true)
    //     .resizable(true)
    //     .build()
    //     .map_err(|e| e.to_string())?;

    Ok(note)
}

#[tauri::command]
fn get_all_notes(app: tauri::AppHandle) -> Vec<Note> {
    log::info!("Command: get_all_notes called");
    let store = NotesStore::load(&app);
    store.notes
}

#[tauri::command]
fn get_note(app: tauri::AppHandle, note_id: String) -> Option<Note> {
    log::info!("Command: get_note called for id: {}", note_id);
    let store = NotesStore::load(&app);
    store.get_note(&note_id).cloned()
}

#[tauri::command]
fn save_note(app: tauri::AppHandle, note: Note) -> Result<(), String> {
    log::info!("Command: save_note called for id: {}", note.id);
    let mut store = NotesStore::load(&app);
    store.update_note(note);
    store.save(&app)
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    log::info!("Command: delete_note called for id: {}", note_id);
    let mut store = NotesStore::load(&app);
    store.delete_note(&note_id);
    store.save(&app)?;

    // Close the window if it exists
    if let Some(window) = app.get_webview_window(&note_id) {
        window.close().ok();
    }

    Ok(())
}

#[tauri::command]
fn save_all_notes(app: tauri::AppHandle, notes: Vec<Note>) -> Result<(), String> {
    log::info!(
        "Command: save_all_notes called (bulk save of {} notes)",
        notes.len()
    );
    let mut store = NotesStore::load(&app);
    store.notes = notes;
    store.save(&app)
}

#[tauri::command]
fn update_window_state(
    app: tauri::AppHandle,
    note_id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    log::info!("Command: update_window_state called for id: {}", note_id);
    let mut store = NotesStore::load(&app);
    if let Some(note) = store.notes.iter_mut().find(|n| n.id == note_id) {
        note.window_state.x = x;
        note.window_state.y = y;
        note.window_state.width = width;
        note.window_state.height = height;
    }
    store.save(&app)
}

#[tauri::command]
async fn open_note_window(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    log::info!("Starting open_note_window for id: {}", note_id);

    // Check if window already exists
    if app.get_webview_window(&note_id).is_some() {
        log::info!("Window {} already exists", note_id);
        return Ok(());
    }

    // Retrieve note data and drop store immediately to avoid deadlock during window creation
    let (title, width, height, x, y) = {
        let store = NotesStore::load(&app);
        if let Some(note) = store.get_note(&note_id) {
            (
                note.title.clone(),
                note.window_state.width,
                note.window_state.height,
                note.window_state.x,
                note.window_state.y,
            )
        } else {
            log::warn!("Note not found: {}", note_id);
            return Ok(());
        }
    };

    let url = WebviewUrl::App(format!("note.html?id={}", note_id).into());
    log::info!("Building window for note: {}", title);

    WebviewWindowBuilder::new(&app, &note_id, url)
        .title(&title)
        .inner_size(width as f64, height as f64)
        .position(x as f64, y as f64)
        .decorations(true)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Set dev icon if in debug mode
    #[cfg(debug_assertions)]
    {
        if let Some(window) = app.get_webview_window(&note_id) {
            let _ = set_window_icon(&window);
        }
    }

    Ok(())
}

fn load_dev_icon() -> Result<Image<'static>, String> {
    log::info!("Loading dev icon bytes");
    let icon_bytes = include_bytes!("../icons/dev-icon.png");
    Image::from_bytes(icon_bytes).map_err(|e| e.to_string())
}

fn set_window_icon(window: &tauri::WebviewWindow) -> Result<(), String> {
    log::info!("Setting window icon for window: {}", window.label());
    let icon = load_dev_icon()?;
    window.set_icon(icon).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dev_icon_loads() {
        let result = load_dev_icon();
        assert!(result.is_ok(), "Dev icon should load successfully");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            create_note,
            get_all_notes,
            get_note,
            save_note,
            delete_note,
            update_window_state,
            open_note_window,
            save_all_notes,
            auth::start_google_auth_server,
            auth::open_external_url,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;

                log::info!("Setup: Setting dev icon for existing windows");
                // Set dev icon for all windows
                let app_handle = app.handle();
                for window in app_handle.webview_windows().values() {
                    let _ = set_window_icon(window);
                }
            }

            // Get command line arguments and send file path to frontend
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = args[1].clone();
                let app_handle = app.handle().clone();

                // Emit event after window is ready using std::thread
                std::thread::spawn(move || {
                    // Small delay to ensure window is ready
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    let _ = app_handle.emit("open-file", file_path);
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
