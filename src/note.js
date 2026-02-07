import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// Global state
let noteId = null;
let noteData = null;
let isEditorMode = false;
let saveTimeout = null;
let lastSavedContent = '';

// Get note ID from URL
function getNoteIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// Initialize editor with content
function initEditor(content) {
    const editorEl = document.getElementById('editor');
    editorEl.innerHTML = '';
    
    const proseMirror = document.createElement('div');
    proseMirror.className = 'ProseMirror';
    proseMirror.contentEditable = 'true';
    proseMirror.style.cssText = 'outline: none; min-height: 100%; white-space: pre-wrap;';
    proseMirror.textContent = content || '';
    editorEl.appendChild(proseMirror);
    
    lastSavedContent = content || '';
    console.log('Simple editor initialized');

    // Track changes
    proseMirror.addEventListener('input', () => {
        scheduleAutoSave();
    });
    
    // Focus the editor
    proseMirror.focus();
}

// Get content from editor
function getEditorContent() {
    const proseMirror = document.querySelector('#editor .ProseMirror');
    if (proseMirror) {
        return proseMirror.textContent;
    }
    return lastSavedContent;
}

// Schedule auto-save with debounce
function scheduleAutoSave() {
    document.getElementById('save-status').textContent = '変更あり...';
    
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        await saveNote();
    }, 1000);
}

// Save note to backend
async function saveNote() {
    if (!noteId || !noteData) return;

    const content = isEditorMode 
        ? document.getElementById('source-editor').value 
        : getEditorContent();

    // Extract title from first line
    const lines = content.split('\n');
    let title = '新しいノート';
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            title = trimmed.replace(/^#+\s*/, '').substring(0, 50);
            break;
        }
    }

    noteData.content = content;
    noteData.title = title;
    noteData.updated_at = new Date().toISOString();

    try {
        await invoke('save_note', { note: noteData });
        lastSavedContent = content;
        document.getElementById('save-status').textContent = '保存済み';
        document.getElementById('note-title').textContent = title;
        
        // Update window title
        const currentWindow = getCurrentWindow();
        currentWindow.setTitle(title);
    } catch (error) {
        console.error('Failed to save note:', error);
        document.getElementById('save-status').textContent = '保存エラー';
    }
}

// Toggle editor mode
function toggleEditorMode() {
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
        modeIndicator.textContent = 'Editor';
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

        initEditor(content);
    }
}

// Delete note
async function deleteNote() {
    if (!noteId) return;

    if (confirm('このノートを削除しますか？')) {
        try {
            await invoke('delete_note', { noteId });
        } catch (error) {
            console.error('Failed to delete note:', error);
        }
    }
}

// Save window position/size
async function saveWindowState() {
    if (!noteId || !noteData) return;

    try {
        const currentWindow = getCurrentWindow();
        const position = await currentWindow.outerPosition();
        const size = await currentWindow.innerSize();

        await invoke('update_window_state', {
            noteId,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
        });
    } catch (error) {
        console.error('Failed to save window state:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('btn-toggle').addEventListener('click', toggleEditorMode);
    document.getElementById('btn-delete').addEventListener('click', deleteNote);

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
    const currentWindow = getCurrentWindow();
    let moveTimeout = null;

    currentWindow.onMoved(() => {
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = setTimeout(saveWindowState, 500);
    });

    currentWindow.onResized(() => {
        if (moveTimeout) clearTimeout(moveTimeout);
        moveTimeout = setTimeout(saveWindowState, 500);
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded fired');
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
            noteData = await invoke('get_note', { noteId });
            if (noteData) break;
            retries--;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('Note data:', noteData);
        
        if (noteData) {
            document.getElementById('note-title').textContent = noteData.title;
            
            if (noteData.color) {
                document.documentElement.style.setProperty('--note-color', noteData.color);
            }

            initEditor(noteData.content);
            
            const currentWindow = getCurrentWindow();
            currentWindow.setTitle(noteData.title);
        } else {
            console.error('Note not found:', noteId);
            // Create minimal noteData for saving
            noteData = {
                id: noteId,
                title: '新しいノート',
                content: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                window_state: { x: 100, y: 100, width: 300, height: 400 },
                color: '#fef3c7'
            };
            initEditor('');
        }
    } catch (error) {
        console.error('Failed to load note:', error);
        document.getElementById('editor').innerHTML = `<div style="padding: 20px; color: red;">エラー: ${error}</div>`;
    }

    setupEventListeners();
});
