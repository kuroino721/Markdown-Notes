import { GoogleDriveService } from './google-drive.js';
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
    // Sync operations
    async initSync() {
        await GoogleDriveService.init();
        if (GoogleDriveService.hasPreviousSession()) {
            try {
                const lastUser = localStorage.getItem('markdown_editor_last_synced_user');
                // Try silent sign-in without popup, using login_hint for better success rate
                await GoogleDriveService.signIn(true, lastUser);
                await this.syncWithDrive();
            } catch (e) {
                console.log('Silent auto-sync not possible:', e);
                // Don't show error to user, just stay in manual sync state
            }
        }
    },

    async getUserInfo() {
        return await GoogleDriveService.getUserInfo();
    },

    async signOut() {
        GoogleDriveService.signOut();
    },

    async signIn() {
        await GoogleDriveService.signIn();
        await this.syncWithDrive();
    },

    async syncWithDrive() {
        // If in an iframe (sidebar), delegate sync to parent window
        if (window.self !== window.top) {
            window.parent.postMessage({ type: 'request-sync' }, '*');
            return;
        }

        if (!GoogleDriveService.isLoggedIn()) return;
        
        try {
            // Check for account switch
            const currentUser = await GoogleDriveService.getUserInfo();
            const lastUser = localStorage.getItem('markdown_editor_last_synced_user');
            
            if (lastUser && currentUser && lastUser !== currentUser) {
                const choice = await this.confirm(
                    `アカウントが ${lastUser} から ${currentUser} に切り替わりました。どうしますか？\n\n「はい」: 現在のノートを消して ${currentUser} のデータを読み込む\n「いいえ」: 現在のノートと ${currentUser} のデータを合体（マージ）させる`,
                    {
                        title: 'アカウント切り替えの確認',
                        okLabel: '切り替える',
                        cancelLabel: 'マージする'
                    }
                );
                
                if (choice) {
                    // Switch: Clear local data before fetching
                    console.log('Switching account data, clearing local storage temporarily');
                    localStorage.setItem(STORAGE_KEY, '[]');
                }
            }

            if (currentUser) {
                localStorage.setItem('markdown_editor_last_synced_user', currentUser);
            }

            const file = await GoogleDriveService.findSyncFile();
            const localNotes = getStoredNotes();
            
            if (file) {
                const remoteNotes = await GoogleDriveService.readSyncFile(file.id);
                
                // Merge Logic with Tombstones
                const mergedMap = new Map();
                
                // 1. Put all local notes (including deleted ones) into map
                localNotes.forEach(n => mergedMap.set(n.id, n));
                
                // 2. Merge remote notes
                remoteNotes.forEach(remoteNote => {
                    const localNote = mergedMap.get(remoteNote.id);
                    if (!localNote) {
                        // Brand new from remote
                        mergedMap.set(remoteNote.id, remoteNote);
                    } else {
                        // Conflict resolution based on updated_at
                        if (new Date(remoteNote.updated_at) > new Date(localNote.updated_at)) {
                            // Remote is newer
                            mergedMap.set(remoteNote.id, remoteNote);
                        }
                    }
                });
                
                const merged = Array.from(mergedMap.values());
                
                // 3. Save merged data
                saveStoredNotes(merged);
                await GoogleDriveService.saveToDrive(merged);
            } else {
                // First time sync, upload local notes
                await GoogleDriveService.saveToDrive(localNotes);
            }
        } catch (error) {
            console.error('Failed to sync with Google Drive:', error);
            throw error;
        }
    },

    isSyncEnabled() {
        return GoogleDriveService.isLoggedIn();
    },

    // Data operations
    async getNotes() {
        return getStoredNotes().filter(n => !n.deleted);
    },

    async getNote(noteId) {
        const notes = getStoredNotes();
        const note = notes.find(n => n.id === noteId);
        return (note && !note.deleted) ? note : null;
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
        
        // Background sync
        this.syncWithDrive().catch(console.error);
        
        return newNote;
    },

    async saveNote(note) {
        const notes = getStoredNotes();
        const index = notes.findIndex(n => n.id === note.id);
        if (index !== -1) {
            notes[index] = { ...note, updated_at: new Date().toISOString(), deleted: false };
        } else {
            notes.push(note);
        }
        saveStoredNotes(notes);
        
        // Background sync
        this.syncWithDrive().catch(console.error);
    },

    async deleteNote(noteId) {
        await this.deleteNotes([noteId]);
    },

    async deleteNotes(noteIds) {
        const notes = getStoredNotes();
        notes.forEach(n => {
            if (noteIds.includes(n.id)) {
                n.deleted = true;
                n.updated_at = new Date().toISOString();
            }
        });
        saveStoredNotes(notes);
        
        // Background sync
        this.syncWithDrive().catch(console.error);
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
