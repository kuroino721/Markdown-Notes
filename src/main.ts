import { getAdapter } from './adapters/index.js';
import { escapeHtml, getPreviewText, getFileNameFromPath } from './utils.js';
import { Adapter } from './adapters/types';

let adapter: Adapter | null = null;

// Render notes grid
async function renderNotes(filter = '') {
    if (!adapter) adapter = await getAdapter();

    let notes = await adapter.getNotes();
    const grid = document.getElementById('notes-grid');
    const emptyState = document.getElementById('empty-state');

    if (!grid || !emptyState) return;

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
    notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    grid.innerHTML = notes.map((note, index) => {
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
            <div class="note-card" data-id="${note.id}" style="animation-delay: ${index * 0.05}s">
                <div class="color-tag" style="background: ${note.color || '#89b4fa'}"></div>
                <input type="checkbox" class="selection-checkbox" data-id="${note.id}">
                <button class="delete-btn" data-id="${note.id}" title="削除"><span class="icon">✕</span></button>
                <div class="title">${escapeHtml(note.title)}</div>
                <div class="preview">${escapeHtml(preview)}</div>
                <div class="timestamp">${timestamp}</div>
            </div>
        `;
    }).join('');

    // Add click handlers
    grid.querySelectorAll('.note-card').forEach(cardElement => {
        const card = cardElement as HTMLElement;
        card.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('delete-btn') || target.closest('.delete-btn')) return;
            if (target.classList.contains('selection-checkbox')) return;

            if (document.body.classList.contains('selection-mode')) {
                const checkbox = card.querySelector('.selection-checkbox') as HTMLInputElement;
                checkbox.checked = !checkbox.checked;
                return;
            }

            const noteId = card.dataset.id;
            if (noteId) {
                openNoteWindow(noteId).catch(console.error);
            }
        });
    });

    grid.querySelectorAll('.delete-btn').forEach(btnElement => {
        const btn = btnElement as HTMLElement;
        btn.addEventListener('click', async (e) => { // eslint-disable-line @typescript-eslint/no-misused-promises
            e.stopPropagation();
            if (!adapter) return;
            const noteId = btn.dataset.id;
            if (!noteId) return;

            const confirmed = await adapter.confirm('このノートを削除しますか？', {
                title: '削除の確認',
                kind: 'warning',
                okLabel: '削除',
                cancelLabel: 'キャンセル'
            });
            if (confirmed) {
                await adapter.deleteNote(noteId);
                await renderNotes();
            }
        });
    });
}

// Open note window using Adapter
async function openNoteWindow(noteId: string) {
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
async function handleFileOpen(filePath: string) {
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
// eslint-disable-next-line @typescript-eslint/no-misused-promises
document.addEventListener('DOMContentLoaded', async () => {
    // Attach console log to Tauri terminal (Tauri only)
    if ((window as any).__TAURI__) {
        try {
            const { attachConsole } = await import('@tauri-apps/plugin-log');
            await attachConsole();
        } catch (e) {
            console.error('Failed to attach console:', e);
        }
    }

    console.log('[DEBUG] main.js: DOMContentLoaded');
    adapter = await getAdapter();

    await renderNotes();

    // New note button
    const btnNew = document.getElementById('btn-new');
    if (btnNew) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnNew.addEventListener('click', createNewNote);
    }

    // Search input
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    if (searchInput) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        searchInput.addEventListener('input', (e) => {
            const target = e.target as HTMLInputElement;
            renderNotes(target.value).catch(console.error);
        });
    }

    // Listen for file open events
    adapter.onFileOpen(async (filePath) => {
        console.log('[DEBUG] main.js: onFileOpen event received:', filePath);
        if (filePath) {
            await handleFileOpen(filePath);
        }
    });

    // Listen for note open events (browser side panel)
    window.addEventListener('open-note-sidebar', (e: Event) => {
        const customEvent = e as CustomEvent;
        const noteId = customEvent.detail.id;
        const sidePanel = document.getElementById('note-side-panel');
        const iframe = document.getElementById('note-iframe') as HTMLIFrameElement;

        if (sidePanel && iframe) {
            iframe.src = `note.html?id=${noteId}&sidebar=true`;
            sidePanel.classList.remove('hidden');
        }
    });

    // Close side panel
    const closeSidePanelBtn = document.getElementById('close-side-panel');
    if (closeSidePanelBtn) {
        closeSidePanelBtn.addEventListener('click', () => {
            const sidePanel = document.getElementById('note-side-panel');
            const iframe = document.getElementById('note-iframe') as HTMLIFrameElement;

            if (sidePanel && iframe) {
                sidePanel.classList.add('hidden');
                iframe.src = 'about:blank';
                // Refresh notes list in case changes were made in the sidebar
                renderNotes().catch(console.error);
            }
        });
    }

    // Handle messages from the iframe (e.g., to close the panel)
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    window.addEventListener('message', async (e) => {
        if (!e.data) return;

        if (e.data.type === 'close-sidebar') {
            const closeBtn = document.getElementById('close-side-panel');
            if (closeBtn) closeBtn.click();
        } else if (e.data.type === 'request-sync') {
            console.log('Sync requested from iframe');
            await triggerSync();
        }
    });

    // Tauri-specific event listener for sync requests from separate windows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__TAURI__) {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        adapter.onFileOpen(() => { /* already handled by adapter.onFileOpen */ });
        // Use Tauri's listen directly for request-sync if available
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen('request-sync', () => {
                console.log('Sync requested from Tauri sub-window');
                triggerSync().catch(console.error);
            });
        }).catch(() => { });
    }

    async function triggerSync() {
        console.log('[DEBUG] main.js: triggerSync() called');
        const adapter = await getAdapter();
        if (adapter.syncWithDrive) {
            adapter.syncWithDrive().catch(err => {
                console.error('[DEBUG] main.js: Sync trigger failed:', err);
            });
        }
    }

    async function updateSyncStatus() {
        if (!adapter) return;

        const btnSync = document.getElementById('btn-sync-gdrive');
        const statusLabel = document.getElementById('sync-status');
        const iconSpan = btnSync?.querySelector('.icon');
        const labelSpan = btnSync?.querySelector('.btn-label');
        if (!statusLabel || !btnSync) return;

        if (adapter.isSyncEnabled()) {
            btnSync.classList.add('synced');
            btnSync.classList.remove('syncing', 'error');
            statusLabel.textContent = '同期済み';
            if (iconSpan) iconSpan.textContent = '✅';

            // Show email if available
            if (adapter.getUserInfo) {
                const userEmail = await adapter.getUserInfo();
                if (userEmail) {
                    btnSync.title = `${userEmail} と同期中`;
                    if (labelSpan) labelSpan.textContent = userEmail.split('@')[0];
                }
            }
        } else {
            btnSync.classList.remove('synced', 'syncing', 'error');
            btnSync.title = 'Google Drive で同期';
            statusLabel.textContent = '同期オフ';
            if (iconSpan) iconSpan.textContent = '🔄';
            if (labelSpan) labelSpan.textContent = 'G-Drive 同期';
        }
    }

    // Google Drive Sync button
    const btnSync = document.getElementById('btn-sync-gdrive');
    const btnLogout = document.getElementById('btn-logout-gdrive');

    if (btnSync && adapter) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnSync.addEventListener('click', async (e) => {
            // If logout button was clicked, don't trigger sync
            const target = e.target as HTMLElement;
            if (target.closest('#btn-logout-gdrive')) return;
            if (!adapter) return;

            const statusLabel = document.getElementById('sync-status');
            if (!statusLabel) return;

            try {
                btnSync.classList.add('syncing');
                btnSync.classList.remove('synced', 'error');
                statusLabel.textContent = '同期中...';

                if (!adapter.isSyncEnabled()) {
                    await adapter.signIn();
                } else {
                    await adapter.syncWithDrive();
                }

                await renderNotes();
                await updateSyncStatus(); // Added await
            } catch (error) {
                console.error('Sync failed:', error);
                btnSync.classList.remove('syncing');
                btnSync.classList.add('error');
                statusLabel.textContent = 'エラー';
            }
        });
    }

    if (btnLogout && adapter) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnLogout.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!adapter) return;
            if (confirm('Google Drive 同期を解除（ログアウト）しますか？')) {
                if (adapter.signOut) {
                    await adapter.signOut();
                    await renderNotes();
                    await updateSyncStatus(); // Added await
                }
            }
        });
    }

    // Initialize sync if available (Non-blocking)
    if (adapter.initSync) {
        (async () => {
            try {
                await adapter.initSync();
                await updateSyncStatus();
            } catch (e) {
                console.error('Failed to init sync:', e);
            }
        })();
    }

    // Selection mode
    const btnSelectMode = document.getElementById('btn-select-mode');
    const btnBulkDelete = document.getElementById('btn-bulk-delete');

    if (btnSelectMode) {
        btnSelectMode.addEventListener('click', () => {
            const isSelectionMode = document.body.classList.toggle('selection-mode');
            btnSelectMode.classList.toggle('active', isSelectionMode);
        });
    }

    if (btnBulkDelete && adapter) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnBulkDelete.addEventListener('click', async () => {
            if (!adapter) return;
            const checkedBoxes = document.querySelectorAll('.selection-checkbox:checked');
            const ids = Array.from(checkedBoxes).map(cb => (cb as HTMLElement).dataset.id).filter(id => id !== undefined) as string[];

            if (ids.length === 0) {
                alert('削除するノートを選択してください。');
                return;
            }

            const confirmed = await adapter.confirm(`${ids.length} 件のノートを削除しますか？`, {
                title: '一括削除の確認',
                kind: 'warning',
                okLabel: '削除',
                cancelLabel: 'キャンセル'
            });

            if (confirmed) {
                if (adapter.deleteNotes) {
                    await adapter.deleteNotes(ids);

                    // Exit selection mode
                    document.body.classList.remove('selection-mode');
                    btnSelectMode?.classList.remove('active');

                    await renderNotes();
                }
            }
        });
    }

    // Refresh notes when window gains focus
    window.addEventListener('focus', () => {
        console.log('[DEBUG] main.js: Window focused, rendering notes');
        renderNotes().catch(console.error);
    });
});
