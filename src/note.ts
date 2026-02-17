import { getAdapter } from './adapters/index.js';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { extractTitle, removeExtraListBlankLines } from './utils.js';
import { setupTableAutoComplete } from './table-utils.js';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { insertHardbreakCommand } from '@milkdown/preset-commonmark';
import { callCommand } from '@milkdown/utils';
import { remarkStringifyOptionsCtx } from '@milkdown/core';
import { Adapter, Note } from './adapters/types';
import { splitListItem } from '@milkdown/prose/schema-list';
import {
    AUTO_SAVE_DELAY_MS,
    STORAGE_KEY_LINE_HEIGHT,
    DEFAULT_LINE_HEIGHT,
    DEFAULT_WINDOW_WIDTH,
    DEFAULT_WINDOW_HEIGHT,
    DEFAULT_WINDOW_X,
    DEFAULT_WINDOW_Y,
    NOTE_COLOR_DEFAULT,
    MOVE_DEBOUNCE_MS,
    RESIZE_DEBOUNCE_MS
} from './constants.js';

let adapter: Adapter | null = null;

// Global editor view reference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let editorView: any = null;

// Table keyboard shortcut handlers are now in table-utils.js

// Global state
let noteId: string | null = null;
let noteData: Note | null = null;
let isEditorMode = false;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSavedContent = '';
let crepeInstance: Crepe | null = null;

// Get note ID from URL
function getNoteIdFromUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// Initialize Milkdown Crepe editor with content
async function initEditor(content: string) {
    const editorEl = document.getElementById('editor');
    if (!editorEl) return;
    editorEl.innerHTML = '';

    // Destroy previous instance if exists
    if (crepeInstance) {
        try {
            await crepeInstance.destroy();
        } catch (e) {
            console.warn('Failed to destroy previous editor:', e);
        }
        crepeInstance = null;
    }

    lastSavedContent = content || '';

    try {
        // Create Milkdown Crepe instance
        crepeInstance = new Crepe({
            root: editorEl,
            defaultValue: content || '',
            features: {
                [CrepeFeature.Latex]: false,  // Disable LaTeX for simplicity
            },
        });

        // Configure listener to intercept Enter and customize serialization
        crepeInstance.editor
            .config((ctx) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                (ctx.get(listenerCtx) as any).keydown = (ctx: any, event: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    const { key, shiftKey } = event;
                    if (key === 'Enter' && !shiftKey) {
                        // Check if we are in a list item
                        if (editorView) {
                            const { state } = editorView;
                            const { selection } = state;
                            const { $from } = selection;
                            // Check ancestors for list_item
                            for (let i = $from.depth; i > 0; i--) {
                                const node = $from.node(i);
                                if (node.type.name === 'list_item') {
                                    // Explicitly call splitListItem
                                    // We need to use the raw ProseMirror command here
                                    // splitListItem requires the list_item type from the schema
                                    const { schema } = state;
                                    const command = splitListItem(schema.nodes.list_item);
                                    if (command(state, editorView.dispatch)) {
                                        return true;
                                    }
                                    return false;
                                }
                            }
                        }

                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        ctx.get(callCommand)(insertHardbreakCommand);
                        return true;
                    }
                    return false;
                };

                // Override hard_break serialization to use backslash instead of spaces
                ctx.update(remarkStringifyOptionsCtx, (prev) => ({
                    ...prev,
                    handlers: {
                        ...(prev.handlers || {}),
                        break: () => '\\\n',
                    },
                }));
            })
            .use(listener);

        // Create the editor
        await crepeInstance.create();

        // Get editor view after creation using editor.action
        try {
            const { editorViewCtx } = await import('@milkdown/core');
            crepeInstance.editor.action((ctx) => {
                editorView = ctx.get(editorViewCtx);
                // console.log('Got editor view via action:', editorView);
            });
        } catch (e) {
            console.error('Failed to get editor view:', e);
        }

        // Listen for changes using editor's update listener
        crepeInstance.on((api) => {
            api.updated(() => {
                scheduleAutoSave();
            });
        });

        // Setup table autocomplete feature
        setupTableAutoComplete(
            editorEl,
            () => editorView,
            () => crepeInstance,
            async (newContent) => {
                if (crepeInstance) {
                    await crepeInstance.destroy();
                    crepeInstance = null;
                }
                await initEditor(newContent);
            }
        );

        // console.log('Milkdown Crepe editor initialized');
    } catch (error) {
        console.error('Failed to initialize Milkdown Crepe:', error);
        // Fallback to simple contentEditable
        const fallbackEl = document.createElement('div');
        fallbackEl.className = 'ProseMirror';
        fallbackEl.contentEditable = 'true';
        fallbackEl.style.cssText = 'outline: none; min-height: 100%; white-space: pre-wrap;';
        fallbackEl.textContent = content || '';
        editorEl.appendChild(fallbackEl);

        fallbackEl.addEventListener('input', () => {
            scheduleAutoSave();
        });
    }
}

// Get content from editor
function getEditorContent(): string {
    if (crepeInstance) {
        try {
            let markdown = crepeInstance.getMarkdown();
            return removeExtraListBlankLines(markdown);
        } catch (e) {
            console.warn('Failed to get markdown from Crepe:', e);
        }
    }

    // Fallback for simple editor
    const proseMirror = document.querySelector('#editor .ProseMirror');
    if (proseMirror && proseMirror.textContent !== null) {
        return proseMirror.textContent;
    }
    return lastSavedContent;
}

// Set content to editor
async function setEditorContent(content: string) {
    if (crepeInstance) {
        try {
            // Destroy and recreate with new content
            await crepeInstance.destroy();
            crepeInstance = null;
            await initEditor(content);
            return;
        } catch (e) {
            console.warn('Failed to set content via Crepe:', e);
        }
    }

    // Fallback
    const proseMirror = document.querySelector('#editor .ProseMirror');
    if (proseMirror) {
        proseMirror.textContent = content;
    }
}

// Schedule auto-save with debounce
function scheduleAutoSave() {
    const saveStatus = document.getElementById('save-status');
    if (saveStatus) saveStatus.textContent = '変更あり...';

    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
        saveNote().catch(console.error);
    }, AUTO_SAVE_DELAY_MS);
}

// Save note to backend
async function saveNote() {
    if (!noteId || !noteData) return;
    if (!adapter) adapter = await getAdapter();

    const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
    const content = isEditorMode && sourceEditor
        ? sourceEditor.value
        : getEditorContent();

    // Extract title from first line
    const title = extractTitle(content);

    noteData.content = content;
    noteData.title = title;
    noteData.updated_at = new Date().toISOString();

    try {
        await adapter.saveNote(noteData);
        lastSavedContent = content;

        const saveStatus = document.getElementById('save-status');
        if (saveStatus) saveStatus.textContent = '保存済み';

        const noteTitle = document.getElementById('note-title');
        if (noteTitle) noteTitle.textContent = title;

        // Update window title
        await adapter.setWindowTitle(title);
    } catch (error) {
        console.error('Failed to save note:', error);
        const saveStatus = document.getElementById('save-status');
        if (saveStatus) saveStatus.textContent = '保存エラー';
    }
}

// Toggle editor mode
async function toggleEditorMode() {
    isEditorMode = !isEditorMode;

    const editorContainer = document.getElementById('editor-container');
    const sourceContainer = document.getElementById('source-container');
    const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
    const modeIndicator = document.getElementById('mode-indicator');
    const toggleBtn = document.getElementById('btn-toggle');

    if (!editorContainer || !sourceContainer || !sourceEditor || !modeIndicator || !toggleBtn) return;

    if (isEditorMode) {
        // Switch to source editor
        const content = getEditorContent();
        sourceEditor.value = content;

        editorContainer.classList.add('hidden');
        sourceContainer.classList.add('active');
        modeIndicator.textContent = 'Source';
        modeIndicator.classList.add('editor-mode');
        toggleBtn.textContent = '👁️';

        sourceEditor.focus();
    } else {
        // Switch to WYSIWYG
        const content = sourceEditor.value;
        lastSavedContent = content;

        editorContainer.classList.remove('hidden');
        sourceContainer.classList.remove('active');
        modeIndicator.textContent = 'WYSIWYG';
        modeIndicator.classList.remove('editor-mode');
        toggleBtn.textContent = '📝';

        await setEditorContent(content);
    }
}

// Delete note
async function deleteNote() {
    if (!noteId) return;
    if (!adapter) adapter = await getAdapter();

    const confirmed = await adapter.confirm('このノートを削除しますか？', {
        title: '削除の確認',
        kind: 'warning',
        okLabel: '削除',
        cancelLabel: 'キャンセル'
    });
    if (confirmed) {
        try {
            await adapter.deleteNote(noteId);
            // Close window after deletion
            await adapter.closeWindow();
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }
}

// Export as markdown file
function exportAsMarkdown() {
    const sourceEditor = document.getElementById('source-editor') as HTMLTextAreaElement;
    const content = isEditorMode && sourceEditor
        ? sourceEditor.value
        : getEditorContent();

    const title = extractTitle(content);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Update note color
async function updateNoteColor(color: string) {
    if (!noteId || !noteData) return;

    noteData.color = color;
    document.documentElement.style.setProperty('--note-color', color);

    // Update active state in UI
    document.querySelectorAll('.color-option').forEach(opt => {
        const option = opt as HTMLElement;
        option.classList.toggle('active', option.dataset.color === color);
    });

    await saveNote();
}

// Save window position/size
async function saveWindowState() {
    if (!noteId || !noteData) return;
    if (!adapter) adapter = await getAdapter();

    try {
        const position = await adapter.getWindowPosition();
        const size = await adapter.getWindowSize();

        await adapter.updateWindowState(
            noteId,
            position.x,
            position.y,
            size.width,
            size.height
        );
    } catch (error) {
        console.error('Failed to save window state:', error);
    }
}

// Setup settings
function setupSettings() {
    const settingsBtn = document.getElementById('btn-settings');
    const settingsPanel = document.getElementById('settings-panel');
    const lineHeightRange = document.getElementById('line-height-range') as HTMLInputElement;
    const lineHeightValue = document.getElementById('line-height-value');

    if (!settingsBtn || !settingsPanel || !lineHeightRange || !lineHeightValue) return;

    // Load saved setting
    const savedLineHeight = localStorage.getItem(STORAGE_KEY_LINE_HEIGHT) || DEFAULT_LINE_HEIGHT;
    document.documentElement.style.setProperty('--line-height', savedLineHeight);
    lineHeightRange.value = savedLineHeight;
    lineHeightValue.textContent = savedLineHeight;

    // Toggle panel
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('hidden');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!settingsPanel.classList.contains('hidden') &&
            !settingsPanel.contains(target) &&
            target !== settingsBtn) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Handle range change
    lineHeightRange.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const value = target.value;
        if (lineHeightValue) lineHeightValue.textContent = value;
        document.documentElement.style.setProperty('--line-height', value);
        localStorage.setItem(STORAGE_KEY_LINE_HEIGHT, value);
    });

    // Handle color selection
    document.querySelectorAll('.color-option').forEach(opt => {
        const option = opt as HTMLElement;
        option.addEventListener('click', () => {
            const color = option.dataset.color;
            if (color) {
                updateNoteColor(color).catch(console.error);
            }
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    setupSettings();
    const btnToggle = document.getElementById('btn-toggle');
    if (btnToggle) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnToggle.addEventListener('click', toggleEditorMode);
    }

    const btnDelete = document.getElementById('btn-delete');
    if (btnDelete) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnDelete.addEventListener('click', deleteNote);
    }

    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
        btnExport.addEventListener('click', exportAsMarkdown);
    }

    // Source editor input
    const sourceEditor = document.getElementById('source-editor');
    if (sourceEditor) {
        sourceEditor.addEventListener('input', () => {
            scheduleAutoSave();
        });
    }

    // Back button (browser mobile only)
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        btnBack.addEventListener('click', async () => {
            if (adapter) await adapter.closeWindow();
        });
    }

    // Context detection for CSS
    const params = new URLSearchParams(window.location.search);
    const isSidebar = params.get('sidebar') === 'true';
    const isTauri = !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);

    if (!isTauri) {
        document.body.classList.add('is-browser');
        if (isSidebar) {
            document.body.classList.add('is-sidebar');
        }
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === '/' || e.code === 'Slash' || e.keyCode === 191) {
                e.preventDefault();
                toggleEditorMode().catch(console.error);
                return;
            }
            if (key === 's') {
                e.preventDefault();
                saveNote().catch(console.error);
            }
        }
    });

    // Save window state on move/resize
    if (adapter) {
        let moveTimeout: ReturnType<typeof setTimeout> | null = null;

        if (adapter.onWindowMoved) {
            adapter.onWindowMoved(() => {
                if (moveTimeout) clearTimeout(moveTimeout);
                moveTimeout = setTimeout(() => {
                    saveWindowState().catch(console.error);
                }, MOVE_DEBOUNCE_MS);
            });
        }

        if (adapter.onWindowResized) {
            adapter.onWindowResized(() => {
                if (moveTimeout) clearTimeout(moveTimeout);
                moveTimeout = setTimeout(() => {
                    saveWindowState().catch(console.error);
                }, RESIZE_DEBOUNCE_MS);
            });
        }
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
    // console.log('DOMContentLoaded fired');
    adapter = await getAdapter();

    noteId = getNoteIdFromUrl();
    // console.log('Note ID:', noteId);

    if (!noteId) {
        console.error('No note ID provided');
        const editor = document.getElementById('editor');
        if (editor) {
            editor.innerHTML = '<div style="padding: 20px; color: red;">エラー: ノートIDが指定されていません</div>';
        }
        return;
    }

    try {
        // Retry logic for newly created notes
        let retries = 10;
        while (retries > 0) {
            // console.log('Attempting to load note, retries left:', retries);
            noteData = await adapter.getNote(noteId);
            if (noteData) break;
            retries--;
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // console.log('Note data:', noteData);

        if (noteData) {
            const noteTitle = document.getElementById('note-title');
            if (noteTitle) noteTitle.textContent = noteData.title;

            if (noteData.color) {
                document.documentElement.style.setProperty('--note-color', noteData.color);
                const activeOpt = document.querySelector(`.color-option[data-color="${noteData.color}"]`);
                if (activeOpt) activeOpt.classList.add('active');
            }

            await initEditor(noteData.content);

            await adapter.setWindowTitle(noteData.title);
        } else {
            console.error('Note not found:', noteId);
            // Create minimal noteData for saving
            noteData = {
                id: noteId,
                title: '新しいノート',
                content: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                window_state: {
                    x: DEFAULT_WINDOW_X,
                    y: DEFAULT_WINDOW_Y,
                    width: DEFAULT_WINDOW_WIDTH,
                    height: DEFAULT_WINDOW_HEIGHT
                },
                color: NOTE_COLOR_DEFAULT,
                deleted: false
            };
            await initEditor('');
        }
    } catch (error) {
        console.error('Failed to load note:', error);
        const editor = document.getElementById('editor');
        if (editor) {
            editor.innerHTML = `<div style="padding: 20px; color: red;">エラー: ${error}</div>`;
        }
    }

    setupEventListeners();
});
