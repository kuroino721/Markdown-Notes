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
// @ts-ignore
import { NOTE_COLOR_DEFAULT } from '../constants.js';
import { Adapter, Note } from './types';

const STORAGE_KEY = 'markdown_editor_notes';

function getStoredNotes(): Note[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
}

function saveStoredNotes(notes: Note[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export const BrowserAdapter: Adapter = {
    // Sync operations
    async initSync(): Promise<void> {
        // If in an iframe (sidebar), do NOT initialize sync independently to avoid redirect loops
        if (window.self !== window.top) {
            return;
        }

        await initGoogleDrive();
        if (hasPreviousGoogleDriveSession()) {
            try {
                const lastUser = localStorage.getItem('markdown_editor_last_synced_user');
                // Try silent sign-in without popup, using login_hint for better success rate
                await signInGoogleDrive(true, lastUser);
                await this.syncWithDrive();
            } catch (e) {
                console.log('Silent auto-sync not possible:', e);
                // Don't show error to user, just stay in manual sync state
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
        // If in an iframe (sidebar), delegate sync to parent window
        if (window.self !== window.top) {
            window.parent.postMessage({ type: 'request-sync' }, '*');
            return;
        }

        if (!isGoogleDriveLoggedIn()) return;

        try {
            // Check for account switch
            const currentUser = await getGoogleDriveUserInfo();
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

            const file = await findGoogleDriveSyncFile();
            const localNotes = getStoredNotes();

            if (file) {
                const remoteNotes = await readGoogleDriveSyncFile(file.id);

                // Use shared merge logic
                const merged = SyncLogic.mergeNotes(localNotes, remoteNotes);

                // Save merged data
                saveStoredNotes(merged);
                await saveToGoogleDrive(merged);
            } else {
                // First time sync, upload local notes
                await saveToGoogleDrive(localNotes);
            }
        } catch (error) {
            console.error('Failed to sync with Google Drive:', error);
            throw error;
        }
    },
    isSyncEnabled() {
        return isGoogleDriveLoggedIn();
    },


    // Data operations
    async getNotes(): Promise<Note[]> {
        return getStoredNotes().filter(n => !n.deleted);
    },

    async getNote(noteId: string): Promise<Note | null> {
        const notes = getStoredNotes();
        const note = notes.find(n => n.id === noteId);
        return (note && !note.deleted) ? note : null;
    },

    async createNote(): Promise<Note> {
        const notes = getStoredNotes();
        const newNote: Note = {
            id: Math.random().toString(36).substring(2, 9),
            title: 'Untitled Note',
            content: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            color: NOTE_COLOR_DEFAULT as string
        };
        notes.push(newNote);
        saveStoredNotes(notes);

        // Background sync
        this.syncWithDrive().catch(console.error);

        return newNote;
    },

    async saveNote(note: Note) {
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

    async deleteNote(noteId: string) {
        await this.deleteNotes([noteId]);
    },

    async deleteNotes(noteIds: string[]) {
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
    async openNote(id: string) {
        // Feature detection for mobile/small screen or PWA standalone mode
        const isMobile = window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

        if (isMobile) {
            // On mobile, direct navigation is better than iframe to avoid recursion and auth issues
            window.location.href = `note.html?id=${id}`;
        } else {
            // In desktop browser, we still like the side panel
            const event = new CustomEvent('open-note-sidebar', { detail: { id } });
            window.dispatchEvent(event);
        }
    },

    async confirm(message: string, _options: any = {}) {
        return window.confirm(message);
    },

    async setWindowTitle(title: string) {
        document.title = title;
    },

    async closeWindow() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('sidebar') === 'true') {
            // In sidebar mode (iframe), tell parent window to close the side panel
            window.parent.postMessage({ type: 'close-sidebar' }, '*');
        } else {
            // If we navigated here directly (mobile PWA), go back to index.html
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = './';
            }
        }
    },

    // Window events
    onWindowMoved(_callback: (payload: any) => void) {
        // Not supported in browser
        return () => { };
    },

    onWindowResized(_callback: (payload: any) => void) {
        // Not supported in browser
        return () => { };
    },

    async getWindowPosition() {
        return { x: window.screenX, y: window.screenY };
    },

    async getWindowSize() {
        return { width: window.innerWidth, height: window.innerHeight };
    },

    async updateWindowState(_noteId: string, _x: number, _y: number, _width: number, _height: number) {
        // Not supported in browser directly
    },

    // Events
    onFileOpen(_callback: (payload: any) => void) {
        // Not supported in browser
        return () => { };
    },

    async readTextFile(_path: string) {
        throw new Error('File system access not supported in browser');
    }
};
