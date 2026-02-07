use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: 300,
            height: 400,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub window_state: WindowState,
    pub color: String,
}

impl Note {
    pub fn new() -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            title: String::from("新しいノート"),
            content: String::new(),
            created_at: now.clone(),
            updated_at: now,
            window_state: WindowState::default(),
            color: String::from("#fef3c7"), // Warm yellow like sticky note
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
pub struct NotesStore {
    pub notes: Vec<Note>,
}

impl NotesStore {
    fn get_store_path(app: &tauri::AppHandle) -> PathBuf {
        let app_dir = app
            .path()
            .app_data_dir()
            .expect("Failed to get app data dir");
        fs::create_dir_all(&app_dir).ok();
        app_dir.join("notes.json")
    }

    pub fn load(app: &tauri::AppHandle) -> Self {
        let path = Self::get_store_path(app);
        if path.exists() {
            let content = fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let path = Self::get_store_path(app);
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    }

    pub fn add_note(&mut self, note: Note) {
        self.notes.push(note);
    }

    pub fn get_note(&self, id: &str) -> Option<&Note> {
        self.notes.iter().find(|n| n.id == id)
    }

    pub fn update_note(&mut self, note: Note) {
        if let Some(existing) = self.notes.iter_mut().find(|n| n.id == note.id) {
            *existing = note;
        }
    }

    pub fn delete_note(&mut self, id: &str) {
        self.notes.retain(|n| n.id != id);
    }
}
