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

let adapter;

// Global editor view reference
let editorView = null;

// Table keyboard shortcut handlers are now in table-utils.js

// Global state
let noteId = null;
let noteData = null;
let isEditorMode = false;
let saveTimeout = null;
let lastSavedContent = '';
let crepeInstance = null;

// Get note ID from URL
function getNoteIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// Initialize Milkdown Crepe editor with content
async function initEditor(content) {
    const editorEl = document.getElementById('editor');
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
                ctx.get(listenerCtx).keydown = (ctx, event) => {
                    const { key, shiftKey } = event;
                    if (key === 'Enter' && !shiftKey) {
                        ctx.get(callCommand)(insertHardbreakCommand);
                        return true;
                    }
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
                console.log('Got editor view via action:', editorView);
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
                await crepeInstance.destroy();
                crepeInstance = null;
                await initEditor(newContent);
            }
        );
        
        console.log('Milkdown Crepe editor initialized');
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
function getEditorContent() {
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
    if (proseMirror) {
        return proseMirror.textContent;
    }
    return lastSavedContent;
}

// Set content to editor
async function setEditorContent(content) {
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
    document.getElementById('save-status').textContent = '変更あり...';
    
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        await saveNote();
    }, AUTO_SAVE_DELAY_MS);
}

// Save note to backend
async function saveNote() {
    if (!noteId || !noteData) return;
    if (!adapter) adapter = await getAdapter();

    const content = isEditorMode 
        ? document.getElementById('source-editor').value 
        : getEditorContent();

    // Extract title from first line
    const title = extractTitle(content);

    noteData.content = content;
    noteData.title = title;
    noteData.updated_at = new Date().toISOString();

    try {
        await adapter.saveNote(noteData);
        lastSavedContent = content;
        document.getElementById('save-status').textContent = '保存済み';
        document.getElementById('note-title').textContent = title;
        
        // Update window title
        await adapter.setWindowTitle(title);
    } catch (error) {
        console.error('Failed to save note:', error);
        document.getElementById('save-status').textContent = '保存エラー';
    }
}

// Toggle editor mode
async function toggleEditorMode() {
    isEditorMode = !isEditorMode;

    const editorContainer = document.getElementById('editor-container');
    const sourceContainer = document.getElementById('source-container');
    const sourceEditor = document.getElementById('source-editor');
    const modeIndicator = document.getElementById('mode-indicator');
    const toggleBtn = document.getElementById('btn-toggle');

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
async function exportAsMarkdown() {
    const content = isEditorMode 
        ? document.getElementById('source-editor').value 
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
async function updateNoteColor(color) {
    if (!noteId || !noteData) return;
    
    noteData.color = color;
    document.documentElement.style.setProperty('--note-color', color);
    
    // Update active state in UI
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === color);
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
    const lineHeightRange = document.getElementById('line-height-range');
    const lineHeightValue = document.getElementById('line-height-value');

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
        if (!settingsPanel.classList.contains('hidden') && 
            !settingsPanel.contains(e.target) && 
            e.target !== settingsBtn) {
            settingsPanel.classList.add('hidden');
        }
    });

    // Handle range change
    lineHeightRange.addEventListener('input', (e) => {
        const value = e.target.value;
        lineHeightValue.textContent = value;
        document.documentElement.style.setProperty('--line-height', value);
        localStorage.setItem(STORAGE_KEY_LINE_HEIGHT, value);
    });

    // Handle color selection
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', () => {
            updateNoteColor(opt.dataset.color);
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    setupSettings();
    document.getElementById('btn-toggle').addEventListener('click', toggleEditorMode);

    document.getElementById('btn-delete').addEventListener('click', deleteNote);
    
    document.getElementById('btn-export').addEventListener('click', exportAsMarkdown);

    // Source editor input
    document.getElementById('source-editor').addEventListener('input', () => {
        scheduleAutoSave();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === '/' || e.code === 'Slash' || e.keyCode === 191) {
                e.preventDefault();
                toggleEditorMode();
                return;
            }
            if (key === 's') {
                e.preventDefault();
                saveNote();
            }
        }
    });

    // Save window state on move/resize
    if (adapter) {
        let moveTimeout = null;

        adapter.onWindowMoved(() => {
            if (moveTimeout) clearTimeout(moveTimeout);
            moveTimeout = setTimeout(saveWindowState, MOVE_DEBOUNCE_MS);
        });

        adapter.onWindowResized(() => {
            if (moveTimeout) clearTimeout(moveTimeout);
            moveTimeout = setTimeout(saveWindowState, RESIZE_DEBOUNCE_MS);
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded fired');
    adapter = await getAdapter();
    
    noteId = getNoteIdFromUrl();
    console.log('Note ID:', noteId);
    
    if (!noteId) {
        console.error('No note ID provided');
        document.getElementById('editor').innerHTML = '<div style="padding: 20px; color: red;">エラー: ノートIDが指定されていません</div>';
        return;
    }

    try {
        // Retry logic for newly created notes
        let retries = 10;
        while (retries > 0) {
            console.log('Attempting to load note, retries left:', retries);
            noteData = await adapter.getNote(noteId);
            if (noteData) break;
            retries--;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('Note data:', noteData);
        
        if (noteData) {
            document.getElementById('note-title').textContent = noteData.title;
            
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
                color: NOTE_COLOR_DEFAULT
            };
            await initEditor('');
        }
    } catch (error) {
        console.error('Failed to load note:', error);
        document.getElementById('editor').innerHTML = `<div style="padding: 20px; color: red;">エラー: ${error}</div>`;
    }

    setupEventListeners();
});
