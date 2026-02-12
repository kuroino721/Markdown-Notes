import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { ask } from '@tauri-apps/plugin-dialog';
import {
    initGoogleDrive,
    signInGoogleDrive,
    signOutGoogleDrive,
    hasPreviousGoogleDriveSession,
    getGoogleDriveUserInfo,
    findGoogleDriveSyncFile,
    readGoogleDriveSyncFile,
    saveToGoogleDrive,
    isGoogleDriveLoggedIn
} from './google-drive.js';
import { SyncLogic } from './sync-logic.js';
import { Adapter, Note } from './types';

// Global flag to help GoogleDriveService detect Tauri environment
// @ts-ignore
window.IS_TAURI_ADAPTER = true;

export const TauriAdapter: Adapter = {
    // Data operations
    async getNotes(): Promise<Note[]> {
        // console.log('[DEBUG] TauriAdapter: getNotes() called');
        const notes = await invoke<Note[]>('get_all_notes');
        // console.log(`[DEBUG] TauriAdapter: getNotes() returned ${notes.length} notes`);
        // Filter out deleted notes (tombstones)
        return notes.filter(n => !n.deleted);
    },

    async getNote(noteId: string): Promise<Note | null> {
        // console.log(`[DEBUG] TauriAdapter: getNote(${noteId}) called`);
        const note = await invoke<Note | null>('get_note', { noteId });
        // console.log(`[DEBUG] TauriAdapter: getNote(${noteId}) result:`, note ? 'found' : 'not found');
        if (note && note.deleted) return null;
        return note;
    },

    async createNote(): Promise<Note> {
        // console.log('[DEBUG] TauriAdapter: createNote() called');
        const note = await invoke<Note>('create_note');
        // console.log('[DEBUG] TauriAdapter: createNote() returned:', note.id);
        return note;
    },

    async saveNote(note: Note): Promise<any> {
        // console.log(`[DEBUG] TauriAdapter: saveNote(${note.id}) called`);
        // Ensure deleted flag is reset when saving (reviving or normal save)
        const updatedNote = { ...note, deleted: !!note.deleted };
        const result = await invoke('save_note', { note: updatedNote });
        // console.log(`[DEBUG] TauriAdapter: saveNote(${note.id}) result: success`);

        // Delegate sync to main window
        this.syncWithDrive().catch(err => {
            console.error('[DEBUG] TauriAdapter: Background sync error:', err);
        });

        return result;
    },

    async deleteNote(noteId: string) {
        // Tombstone strategy: mark as deleted instead of hard delete
        const note = await this.getNote(noteId);
        if (note) {
            note.deleted = true;
            note.updated_at = new Date().toISOString();
            await this.saveNote(note);
            // Close the window if it exists (Tauri windows are top-level)
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const window = await WebviewWindow.getByLabel(noteId);
            if (window) await window.close();

            // Try background sync
            this.syncWithDrive().catch(console.error);
        }
    },

    async deleteNotes(noteIds: string[]) {
        // Bulk tombstone
        const notes = await invoke<Note[]>('get_all_notes');
        const now = new Date().toISOString();
        let changed = false;

        for (const note of notes) {
            if (noteIds.includes(note.id)) {
                note.deleted = true;
                note.updated_at = now;
                changed = true;

                // Close windows
                const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                const window = await WebviewWindow.getByLabel(note.id);
                if (window) await window.close();
            }
        }

        if (changed) {
            await invoke('save_all_notes', { notes });
            this.syncWithDrive().catch(console.error);
        }
    },

    // Sync operations
    async initSync() {
        await initGoogleDrive();
        if (hasPreviousGoogleDriveSession()) {
            try {
                const lastUser = localStorage.getItem('markdown_editor_last_synced_user');
                await signInGoogleDrive(true, lastUser || undefined);
                await this.syncWithDrive();
            } catch (e) {
                console.log('Tauri silent auto-sync not available:', e);
            }
        }
    },

    async getUserInfo() {
        return await getGoogleDriveUserInfo();
    },

    async signOut() {
        signOutGoogleDrive();
    },

    async signIn() {
        await signInGoogleDrive();
        await this.syncWithDrive();
    },

    async syncWithDrive() {
        // console.log('[DEBUG] TauriAdapter: syncWithDrive() initiated');
        // In Tauri, we check if we're in the main window
        const currentWindow = getCurrentWindow();
        if (currentWindow.label !== 'main') {
            // console.log('[DEBUG] TauriAdapter: Sync requested from sub-window, emitting event');
            const { emit } = await import('@tauri-apps/api/event');
            await emit('request-sync');
            return;
        }

        if (!isGoogleDriveLoggedIn()) {
            // console.log('[DEBUG] TauriAdapter: Sync skipped - Not logged in');
            return;
        }

        try {
            const currentUser = await getGoogleDriveUserInfo();
            const lastUser = localStorage.getItem('markdown_editor_last_synced_user');

            if (lastUser && currentUser && lastUser !== currentUser) {
                const choice = await this.confirm(
                    `アカウントが ${lastUser} から ${currentUser} に切り替わりました。どうしますか？\n\n「はい」: デスクトップのデータを消して ${currentUser} のデータを読み込む\n「いいえ」: デスクトップのデータを ${currentUser} のデータと合体（マージ）させる`,
                    {
                        title: 'アカウント切り替えの確認',
                        okLabel: '切り替える',
                        cancelLabel: 'マージする'
                    }
                );

                if (choice) {
                    await invoke('save_all_notes', { notes: [] });
                }
            }

            if (currentUser) {
                localStorage.setItem('markdown_editor_last_synced_user', currentUser);
            }

            const file = await findGoogleDriveSyncFile();
            const localNotes = await invoke<Note[]>('get_all_notes');

            if (file) {
                const remoteNotes = await readGoogleDriveSyncFile(file.id);
                const merged = SyncLogic.mergeNotes(localNotes, remoteNotes);

                // Save merged data back to Rust and then to Drive
                await invoke('save_all_notes', { notes: merged });
                await saveToGoogleDrive(merged);
            } else {
                await saveToGoogleDrive(localNotes);
            }
        } catch (error) {
            console.error('Tauri sync failed:', error);
            throw error;
        }
    },

    isSyncEnabled() {
        return isGoogleDriveLoggedIn();
    },

    // UI/Window operations
    async openNote(noteId: string) {
        // console.log(`[DEBUG] TauriAdapter: openNote(${noteId}) called`);
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        // Check if window already exists
        const existing = await WebviewWindow.getByLabel(noteId);
        if (existing) {
            // console.log(`[DEBUG] TauriAdapter: Window ${noteId} already exists, focusing`);
            await existing.setFocus();
            return;
        }

        // Create new window via Rust command
        // console.log(`[DEBUG] TauriAdapter: Creating new window for ${noteId}`);
        await invoke('open_note_window', { noteId });
    },

    async confirm(message: string, options: any = {}) {
        return await ask(message, {
            title: options.title || '確認',
            kind: options.kind || 'warning',
            okLabel: options.okLabel || 'OK',
            cancelLabel: options.cancelLabel || 'キャンセル'
        });
    },

    async setWindowTitle(title: string) {
        const currentWindow = getCurrentWindow();
        await currentWindow.setTitle(title);
    },

    async closeWindow() {
        const currentWindow = getCurrentWindow();
        await currentWindow.close();
    },

    // Window events
    onWindowMoved(callback: (payload: any) => void) {
        const currentWindow = getCurrentWindow();
        // @ts-ignore
        const unlisten = currentWindow.onMoved(callback);
        // Return a cleanup function
        // Note: onMoved returns a promise that resolves to an unlisten function.
        // Since we can't await here directly in a synchronous return, we handle it slightly differently or accept that we might not be able to unlisten immediately.
        // For strict correctness in TS with async setup:
        let u: (() => void) | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        unlisten.then((fn: any) => { u = fn; });
        return () => { if (u) u(); };
    },

    onWindowResized(callback: (payload: any) => void) {
        const currentWindow = getCurrentWindow();
        // @ts-ignore
        const unlisten = currentWindow.onResized(callback);
        let u: (() => void) | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        unlisten.then((fn: any) => { u = fn; });
        return () => { if (u) u(); };
    },

    async getWindowPosition() {
        const currentWindow = getCurrentWindow();
        return await currentWindow.outerPosition();
    },

    async getWindowSize() {
        const currentWindow = getCurrentWindow();
        return await currentWindow.innerSize();
    },

    async updateWindowState(noteId: string, x: number, y: number, width: number, height: number) {
        return await invoke('update_window_state', { noteId, x, y, width, height });
    },

    // Events
    onFileOpen(callback: (payload: any) => void) {
        // @ts-ignore
        const unlistenPromise = listen('open-file', (event) => {
            callback(event.payload);
        });

        let u: (() => void) | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        unlistenPromise.then((fn: any) => { u = fn; });
        return () => { if (u) u(); };
    },

    async readTextFile(path: string) {
        return await readTextFile(path);
    }
};
