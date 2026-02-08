import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { ask } from '@tauri-apps/plugin-dialog';

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
        const preview = note.content
            .replace(/^#+\s*/gm, '')
            .replace(/\*\*|__|\*|_|`/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .substring(0, 100);

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

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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
        
        // Create new window
        const webview = new WebviewWindow(noteId, {
            url: `note.html?id=${noteId}`,
            title: 'ノート',
            width: 300,
            height: 400,
            x: 100,
            y: 100,
            decorations: true,
            resizable: true,
        });
        
        webview.once('tauri://error', (e) => {
            console.error('Window error:', e);
        });
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
        const fileName = filePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '');
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
    listen('open-file', async (event) => {
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
