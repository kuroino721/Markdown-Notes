/**
 * Browser implementation using localStorage
 */
import { NOTE_COLOR_DEFAULT } from '../constants.js';

const STORAGE_KEY = 'markdown_editor_notes';

function getStoredNotes() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
}

function saveStoredNotes(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export const BrowserAdapter = {
    // Data operations
    async getNotes() {
        return getStoredNotes();
    },

    async getNote(noteId) {
        const notes = getStoredNotes();
        return notes.find(n => n.id === noteId);
    },

    async createNote() {
        const notes = getStoredNotes();
        const newNote = {
            id: Math.random().toString(36).substring(2, 9),
            title: 'Untitled Note',
            content: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            color: NOTE_COLOR_DEFAULT
        };
        notes.push(newNote);
        saveStoredNotes(notes);
        return newNote;
    },

    async saveNote(note) {
        const notes = getStoredNotes();
        const index = notes.findIndex(n => n.id === note.id);
        if (index !== -1) {
            notes[index] = { ...note, updated_at: new Date().toISOString() };
        } else {
            notes.push(note);
        }
        saveStoredNotes(notes);
    },

    async deleteNote(noteId) {
        const notes = getStoredNotes();
        const filtered = notes.filter(n => n.id !== noteId);
        saveStoredNotes(filtered);
    },

    // UI/Window operations
    async openNote(id) {
        // In browser, we dispatch a custom event to open in side panel instead of a new tab
        const event = new CustomEvent('open-note-sidebar', { detail: { id } });
        window.dispatchEvent(event);
    },

    async confirm(message, options = {}) {
        return window.confirm(message);
    },

    async setWindowTitle(title) {
        document.title = title;
    },

    async closeWindow() {
        // In sidebar mode, we don't want to close the whole window
        const params = new URLSearchParams(window.location.search);
        if (params.get('sidebar') === 'true') {
            // Tell parent window to close the side panel
            window.parent.postMessage({ type: 'close-sidebar' }, '*');
        } else {
            window.close();
        }
    },

    // Window events (mostly no-ops or simple stubs)
    onWindowMoved(callback) {
        // Not really applicable in browser, but we can hook to window resize
        return () => {}; // Unsubscribe stub
    },

    onWindowResized(callback) {
        window.addEventListener('resize', callback);
        return () => window.removeEventListener('resize', callback);
    },

    async getWindowPosition() {
        return { x: 0, y: 0 };
    },

    async getWindowSize() {
        return { width: window.innerWidth, height: window.innerHeight };
    },

    async updateWindowState(noteId, x, y, width, height) {
        // Optional: could save to note metadata if we care
        console.log('Browser: updateWindowState called', { noteId, x, y, width, height });
    },

    // Events
    onFileOpen(callback) {
        // Not easily supported in browser without file picker
        return () => {}; // Unsubscribe stub
    },

    async readTextFile(path) {
        throw new Error('Direct file access not supported in browser');
    }
};
