import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { ask } from '@tauri-apps/plugin-dialog';
import { escapeHtml, getPreviewText, getFileNameFromPath } from './utils.js';
import { 
    DEFAULT_WINDOW_WIDTH, 
    DEFAULT_WINDOW_HEIGHT, 
    DEFAULT_WINDOW_X, 
    DEFAULT_WINDOW_Y,
    EVENT_OPEN_FILE,
    EVENT_TAURI_ERROR
} from './constants.js';

// Render notes grid
async function renderNotes() {
    const notes = await invoke('get_all_notes');
    const grid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('empty-state');

    if (notes.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    // Sort by updated_at descending
    notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    grid.innerHTML = notes.map(note => {
        // Format timestamp
        const date = new Date(note.updated_at);
        const timestamp = date.toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Get preview text (first 100 chars, strip markdown)
        const preview = getPreviewText(note.content);

        return `
            <div class="note-card" data-id="${note.id}" data-color="${note.color}">
                <button class="delete-btn" data-id="${note.id}" title="削除">🗑️</button>
                <div class="title">${escapeHtml(note.title)}</div>
                <div class="preview">${escapeHtml(preview)}</div>
                <div class="timestamp">${timestamp}</div>
            </div>
        `;
    }).join('');

    // Add click handlers
    grid.querySelectorAll('.note-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) return;
            const noteId = card.dataset.id;
            openNoteWindow(noteId);
        });
    });

    grid.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const noteId = btn.dataset.id;
            const confirmed = await ask('このノートを削除しますか？', {
                title: '削除の確認',
                kind: 'warning',
                okLabel: '削除',
                cancelLabel: 'キャンセル'
            });
            if (confirmed) {
                await invoke('delete_note', { noteId });
                renderNotes();
            }
        });
    });
}

// escapeHtml is imported from utils.js

// Open note window using JavaScript Tauri API
async function openNoteWindow(noteId) {
    try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        
        // Check if window already exists
        const existing = await WebviewWindow.getByLabel(noteId);
        if (existing) {
            await existing.setFocus();
            return;
        }
        
        // Create new window via Rust command to ensure icon and state are correct
        await invoke('open_note_window', { noteId });
    } catch (error) {
        console.error('Failed to open note window:', error);
    }
}

// Create new note
async function createNewNote() {
    try {
        const note = await invoke('create_note');
        console.log('Created note:', note);
        renderNotes();
        // Open the note window after creation
        await openNoteWindow(note.id);
    } catch (error) {
        console.error('Failed to create note:', error);
    }
}

// Handle file opened from command line
async function handleFileOpen(filePath) {
    try {
        const content = await readTextFile(filePath);
        
        // Create a new note with this content
        const note = await invoke('create_note');
        
        // Update the note with the file content
        const fileName = getFileNameFromPath(filePath);
        note.content = content;
        note.title = fileName;
        
        await invoke('save_note', { note });
        renderNotes();
    } catch (error) {
        console.error('Failed to open file:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await renderNotes();

    // New note button
    document.getElementById('btn-new').addEventListener('click', createNewNote);

    // Listen for file open events
    listen(EVENT_OPEN_FILE, async (event) => {
        const filePath = event.payload;
        if (filePath) {
            await handleFileOpen(filePath);
        }
    });

    // Refresh notes when window gains focus
    window.addEventListener('focus', () => {
        renderNotes();
    });
});
