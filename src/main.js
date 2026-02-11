import { getAdapter } from './adapters/index.js';
import { escapeHtml, getPreviewText, getFileNameFromPath } from './utils.js';
import { 
    EVENT_OPEN_FILE
} from './constants.js';

let adapter;

// Render notes grid
async function renderNotes(filter = '') {
    if (!adapter) adapter = await getAdapter();
    
    let notes = await adapter.getNotes();
    const grid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('empty-state');

    if (notes.length === 0 && !filter) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    if (filter) {
        const query = filter.toLowerCase();
        notes = notes.filter(note => 
            note.title.toLowerCase().includes(query) || 
            note.content.toLowerCase().includes(query)
        );
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
            const confirmed = await adapter.confirm('このノートを削除しますか？', {
                title: '削除の確認',
                kind: 'warning',
                okLabel: '削除',
                cancelLabel: 'キャンセル'
            });
            if (confirmed) {
                await adapter.deleteNote(noteId);
                renderNotes();
            }
        });
    });
}

// Open note window using Adapter
async function openNoteWindow(noteId) {
    if (!adapter) adapter = await getAdapter();
    try {
        await adapter.openNote(noteId);
    } catch (error) {
        console.error('Failed to open note window:', error);
    }
}

// Create new note
async function createNewNote() {
    if (!adapter) adapter = await getAdapter();
    try {
        const note = await adapter.createNote();
        console.log('Created note:', note);
        await renderNotes();
        // Open the note window after creation
        await openNoteWindow(note.id);
    } catch (error) {
        console.error('Failed to create note:', error);
    }
}

// Handle file opened from command line (Tauri only)
async function handleFileOpen(filePath) {
    if (!adapter) adapter = await getAdapter();
    try {
        const content = await adapter.readTextFile(filePath);
        
        // Create a new note with this content
        const note = await adapter.createNote();
        
        // Update the note with the file content
        const fileName = getFileNameFromPath(filePath);
        note.content = content;
        note.title = fileName;
        
        await adapter.saveNote(note);
        await renderNotes();
    } catch (error) {
        console.error('Failed to open file:', error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    adapter = await getAdapter();
    
    await renderNotes();

    // New note button
    document.getElementById('btn-new').addEventListener('click', createNewNote);

    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
        renderNotes(e.target.value);
    });

    // Listen for file open events
    adapter.onFileOpen(async (filePath) => {
        if (filePath) {
            await handleFileOpen(filePath);
        }
    });

    // Listen for note open events (browser side panel)
    window.addEventListener('open-note-sidebar', (e) => {
        const noteId = e.detail.id;
        const sidePanel = document.getElementById('note-side-panel');
        const iframe = document.getElementById('note-iframe');
        
        iframe.src = `note.html?id=${noteId}&sidebar=true`;
        sidePanel.classList.remove('hidden');
    });

    // Close side panel
    document.getElementById('close-side-panel').addEventListener('click', () => {
        const sidePanel = document.getElementById('note-side-panel');
        const iframe = document.getElementById('note-iframe');
        
        sidePanel.classList.add('hidden');
        iframe.src = 'about:blank';
        // Refresh notes list in case changes were made in the sidebar
        renderNotes();
    });

    // Handle messages from the iframe (e.g., to close the panel)
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'close-sidebar') {
            document.getElementById('close-side-panel').click();
        }
    });

    // Initialize sync if available
    if (adapter.initSync) {
        try {
            await adapter.initSync();
            updateSyncStatus();
        } catch (e) {
            console.error('Failed to init sync:', e);
        }
    }

    // Google Drive Sync button
    const btnSync = document.getElementById('btn-sync-gdrive');
    if (btnSync) {
        btnSync.addEventListener('click', async () => {
            const statusLabel = document.getElementById('sync-status');
            try {
                statusLabel.textContent = '同期中...';
                statusLabel.className = 'status-indicator syncing';
                
                if (!adapter.isSyncEnabled()) {
                    await adapter.signIn();
                } else {
                    await adapter.syncWithDrive();
                }
                
                await renderNotes();
                updateSyncStatus();
            } catch (error) {
                console.error('Sync failed:', error);
                statusLabel.textContent = '同期エラー';
                statusLabel.className = 'status-indicator error';
            }
        });
    }

    function updateSyncStatus() {
        const statusLabel = document.getElementById('sync-status');
        if (!statusLabel) return;
        
        if (adapter.isSyncEnabled && adapter.isSyncEnabled()) {
            statusLabel.textContent = '同期済み';
            statusLabel.className = 'status-indicator';
        } else {
            statusLabel.textContent = '';
            statusLabel.className = 'status-indicator';
        }
    }

    // Refresh notes when window gains focus
    window.addEventListener('focus', () => {
        renderNotes();
    });
});
