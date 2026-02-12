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
    #[serde(default)]
    pub window_state: WindowState,
    #[serde(default = "default_color")]
    pub color: String,
    #[serde(default)]
    pub deleted: bool,
}

fn default_color() -> String {
    "#fef3c7".to_string()
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
            deleted: false,
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
        Self::load_from_path(&path)
    }

    pub fn load_from_path(path: &PathBuf) -> Self {
        log::debug!("NotesStore: Loading from {:?}", path);
        if path.exists() {
            let content = fs::read_to_string(path).unwrap_or_default();
            let store = serde_json::from_str(&content).unwrap_or_default();
            log::debug!("NotesStore: Loaded store successfully");
            store
        } else {
            log::debug!("NotesStore: Store file does not exist, using default");
            Self::default()
        }
    }

    pub fn save(&self, app: &tauri::AppHandle) -> Result<(), String> {
        let path = Self::get_store_path(app);
        self.save_to_path(&path)
    }

    pub fn save_to_path(&self, path: &PathBuf) -> Result<(), String> {
        log::debug!("NotesStore: Saving to {:?}", path);
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, content).map_err(|e| e.to_string())?;
        log::debug!("NotesStore: Saved successfully");
        Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    // ── WindowState tests ──────────────────────────────────

    #[test]
    fn window_state_default_values() {
        let ws = WindowState::default();
        assert_eq!(ws.x, 100);
        assert_eq!(ws.y, 100);
        assert_eq!(ws.width, 300);
        assert_eq!(ws.height, 400);
    }

    // ── Note tests ─────────────────────────────────────────

    #[test]
    fn note_new_has_valid_uuid() {
        let note = Note::new();
        // UUID v4 format: 8-4-4-4-12 hex chars
        assert_eq!(note.id.len(), 36);
        assert_eq!(note.id.chars().filter(|c| *c == '-').count(), 4);
    }

    #[test]
    fn note_new_has_default_title() {
        let note = Note::new();
        assert_eq!(note.title, "新しいノート");
    }

    #[test]
    fn note_new_has_empty_content() {
        let note = Note::new();
        assert!(note.content.is_empty());
    }

    #[test]
    fn note_new_has_default_color() {
        let note = Note::new();
        assert_eq!(note.color, "#fef3c7");
    }

    #[test]
    fn note_new_has_default_window_state() {
        let note = Note::new();
        assert_eq!(note.window_state.x, 100);
        assert_eq!(note.window_state.y, 100);
        assert_eq!(note.window_state.width, 300);
        assert_eq!(note.window_state.height, 400);
    }

    #[test]
    fn note_new_timestamps_are_rfc3339() {
        let note = Note::new();
        // RFC3339 timestamps contain 'T' and '+' or 'Z'
        assert!(note.created_at.contains('T'));
        assert!(note.updated_at.contains('T'));
    }

    #[test]
    fn note_new_timestamps_are_equal() {
        let note = Note::new();
        assert_eq!(note.created_at, note.updated_at);
    }

    #[test]
    fn note_new_unique_ids() {
        let note1 = Note::new();
        let note2 = Note::new();
        assert_ne!(note1.id, note2.id);
    }

    // ── NotesStore tests ───────────────────────────────────

    fn create_test_note(id: &str, title: &str) -> Note {
        Note {
            id: id.to_string(),
            title: title.to_string(),
            content: String::new(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
            updated_at: "2026-01-01T00:00:00+00:00".to_string(),
            window_state: WindowState::default(),
            color: "#fef3c7".to_string(),
            deleted: false,
        }
    }

    #[test]
    fn store_default_is_empty() {
        let store = NotesStore::default();
        assert!(store.notes.is_empty());
    }

    #[test]
    fn store_add_note() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "Test"));
        assert_eq!(store.notes.len(), 1);
    }

    #[test]
    fn store_add_multiple_notes() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "First"));
        store.add_note(create_test_note("2", "Second"));
        store.add_note(create_test_note("3", "Third"));
        assert_eq!(store.notes.len(), 3);
    }

    #[test]
    fn store_get_note_found() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("abc", "My Note"));
        let note = store.get_note("abc");
        assert!(note.is_some());
        assert_eq!(note.unwrap().title, "My Note");
    }

    #[test]
    fn store_get_note_not_found() {
        let store = NotesStore::default();
        assert!(store.get_note("nonexistent").is_none());
    }

    #[test]
    fn store_update_note() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "Original"));

        let updated = Note {
            title: "Updated".to_string(),
            content: "New content".to_string(),
            ..create_test_note("1", "")
        };
        store.update_note(updated);

        let note = store.get_note("1").unwrap();
        assert_eq!(note.title, "Updated");
        assert_eq!(note.content, "New content");
    }

    #[test]
    fn store_update_nonexistent_note_is_noop() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "Original"));
        store.update_note(create_test_note("999", "Ghost"));
        // Should still have only 1 note, unchanged
        assert_eq!(store.notes.len(), 1);
        assert_eq!(store.get_note("1").unwrap().title, "Original");
    }

    #[test]
    fn store_delete_note() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "First"));
        store.add_note(create_test_note("2", "Second"));
        store.delete_note("1");
        assert_eq!(store.notes.len(), 1);
        assert!(store.get_note("1").is_none());
        assert!(store.get_note("2").is_some());
    }

    #[test]
    fn store_delete_nonexistent_note_is_noop() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "First"));
        store.delete_note("nonexistent");
        assert_eq!(store.notes.len(), 1);
    }

    #[test]
    fn store_serialization_roundtrip() {
        let mut store = NotesStore::default();
        store.add_note(create_test_note("1", "Test Note"));
        store.notes[0].content = "Hello, world!".to_string();

        let json = serde_json::to_string(&store).unwrap();
        let restored: NotesStore = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.notes.len(), 1);
        assert_eq!(restored.notes[0].id, "1");
        assert_eq!(restored.notes[0].title, "Test Note");
        assert_eq!(restored.notes[0].content, "Hello, world!");
    }

    #[test]
    fn test_note_json_serialization() {
        let note = create_test_note("test-id", "Test Title");
        let json = serde_json::to_string(&note).unwrap();

        // Verify fields are present in JSON
        assert!(json.contains("\"id\":\"test-id\""));
        assert!(json.contains("\"title\":\"Test Title\""));
        assert!(json.contains("\"content\":\"\""));
        assert!(json.contains("\"created_at\":"));
        assert!(json.contains("\"updated_at\":"));
        assert!(json.contains("\"window_state\":"));
        assert!(json.contains("\"color\":\"#fef3c7\""));
        assert!(json.contains("\"deleted\":false"));
    }

    #[test]
    fn test_note_deserialization_with_missing_fields() {
        let json = r#"{
            "id": "test-uuid",
            "title": "Minimal Note",
            "content": "Hello",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }"#;

        let note: Note = serde_json::from_str(json).unwrap();

        assert_eq!(note.id, "test-uuid");
        assert_eq!(note.window_state.x, 100); // Default from WindowState::default()
        assert_eq!(note.color, "#fef3c7"); // Default from default_color()
        assert_eq!(note.deleted, false); // Default from bool default
    }

    #[test]
    fn test_window_state_json_serialization() {
        let ws = WindowState {
            x: 10,
            y: 20,
            width: 100,
            height: 200,
        };
        let json = serde_json::to_string(&ws).unwrap();

        // Verify fields are present in JSON
        assert!(json.contains("\"x\":10"));
        assert!(json.contains("\"y\":20"));
        assert!(json.contains("\"width\":100"));
        assert!(json.contains("\"height\":200"));
    }
}
