import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { ask } from '@tauri-apps/plugin-dialog';

export const TauriAdapter = {
    // Data operations
    async getNotes() {
        return await invoke('get_all_notes');
    },

    async getNote(noteId) {
        return await invoke('get_note', { noteId });
    },

    async createNote() {
        return await invoke('create_note');
    },

    async saveNote(note) {
        return await invoke('save_note', { note });
    },

    async deleteNote(noteId) {
        return await invoke('delete_note', { noteId });
    },

    // UI/Window operations
    async openNote(noteId) {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        
        // Check if window already exists
        const existing = await WebviewWindow.getByLabel(noteId);
        if (existing) {
            await existing.setFocus();
            return;
        }
        
        // Create new window via Rust command
        await invoke('open_note_window', { noteId });
    },

    async confirm(message, options = {}) {
        return await ask(message, {
            title: options.title || '確認',
            kind: options.kind || 'warning',
            okLabel: options.okLabel || 'OK',
            cancelLabel: options.cancelLabel || 'キャンセル'
        });
    },

    async setWindowTitle(title) {
        const currentWindow = getCurrentWindow();
        await currentWindow.setTitle(title);
    },

    async closeWindow() {
        const currentWindow = getCurrentWindow();
        await currentWindow.close();
    },

    // Window events
    onWindowMoved(callback) {
        const currentWindow = getCurrentWindow();
        return currentWindow.onMoved(callback);
    },

    onWindowResized(callback) {
        const currentWindow = getCurrentWindow();
        return currentWindow.onResized(callback);
    },

    async getWindowPosition() {
        const currentWindow = getCurrentWindow();
        return await currentWindow.outerPosition();
    },

    async getWindowSize() {
        const currentWindow = getCurrentWindow();
        return await currentWindow.innerSize();
    },

    async updateWindowState(noteId, x, y, width, height) {
        return await invoke('update_window_state', { noteId, x, y, width, height });
    },

    // Events
    onFileOpen(callback) {
        return listen('open-file', (event) => {
            callback(event.payload);
        });
    },

    async readTextFile(path) {
        return await readTextFile(path);
    }
};
