use app_lib::notes::{Note, NotesStore};

use tempfile::tempdir;

#[test]
fn test_persistence_cycle() {
    // 1. Create a temporary directory for the test
    let dir = tempdir().expect("failed to create temp dir");
    let file_path = dir.path().join("notes.json");

    // 2. Create a store and add some notes
    let mut store = NotesStore::default();
    let note1 = Note::new();
    let mut note2 = Note::new();
    note2.title = "Second Note".to_string();
    note2.content = "Content of second note".to_string();

    store.add_note(note1.clone());
    store.add_note(note2.clone());

    // 3. Save to the temporary file
    store
        .save_to_path(&file_path)
        .expect("failed to save store");

    // 4. Load from the same file into a new store instance
    let loaded_store = NotesStore::load_from_path(&file_path);

    // 5. Verify data integrity
    assert_eq!(loaded_store.notes.len(), 2);

    // Check first note
    let loaded_note1 = loaded_store.get_note(&note1.id).expect("note1 not found");
    assert_eq!(loaded_note1.title, note1.title);
    assert_eq!(loaded_note1.content, note1.content);
    assert_eq!(loaded_note1.id, note1.id);

    // Check second note
    let loaded_note2 = loaded_store.get_note(&note2.id).expect("note2 not found");
    assert_eq!(loaded_note2.title, note2.title);
    assert_eq!(loaded_note2.content, note2.content);
    assert_eq!(loaded_note2.id, note2.id);

    // 6. Cleanup is handled automatically by tempdir going out of scope
}

#[test]
fn test_data_integrity_special_chars() {
    let dir = tempdir().expect("failed to create temp dir");
    let file_path = dir.path().join("notes_special.json");

    let mut store = NotesStore::default();
    let mut note = Note::new();
    note.title = "Special Chars: < > \" ' & ¥".to_string();
    note.content = "Multi-line\nContent\r\nWith\tTabs".to_string();

    store.add_note(note.clone());
    store.save_to_path(&file_path).expect("failed to save");

    let loaded_store = NotesStore::load_from_path(&file_path);
    let loaded_note = loaded_store.get_note(&note.id).unwrap();

    assert_eq!(loaded_note.title, note.title);
    assert_eq!(loaded_note.content, note.content);
}

#[test]
fn test_empty_store_persistence() {
    let dir = tempdir().expect("failed to create temp dir");
    let file_path = dir.path().join("empty.json");

    let store = NotesStore::default();
    store.save_to_path(&file_path).expect("failed to save");

    let loaded_store = NotesStore::load_from_path(&file_path);
    assert!(loaded_store.notes.is_empty());
}

#[test]
fn test_load_non_existent_file() {
    let dir = tempdir().expect("failed to create temp dir");
    let file_path = dir.path().join("non_existent.json");

    // Should return default empty store without error
    let store = NotesStore::load_from_path(&file_path);
    assert!(store.notes.is_empty());
}
