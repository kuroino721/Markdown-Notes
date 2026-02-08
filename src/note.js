import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

// Global editor view reference
let editorView = null;

// Table autocomplete handler
function setupTableAutoComplete(editorElement) {
    editorElement.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey) {
            return;
        }
        
        console.log('Enter pressed, checking for table pattern...');
        
        if (!editorView) {
            console.log('Editor view not available');
            return;
        }
        
        console.log('Found editor view');
        
        const { state } = editorView;
        const { selection } = state;
        const { $from } = selection;
        
        // Get the full text of the current text block (paragraph)
        const parent = $from.parent;
        if (!parent.isTextblock) {
            console.log('Not in a text block');
            return;
        }
        
        const lineText = parent.textContent;
        console.log('Current line text:', lineText);
        
        // Check if the line matches table header pattern: | ... |
        // Must start with | and end with |, with content between pipes
        const trimmedLine = lineText.trim();
        const tableRowRegex = /^\|[^|]+(\|[^|]*)*\|$/;
        
        if (!tableRowRegex.test(trimmedLine)) {
            console.log('Does not match table pattern');
            return;
        }
        
        // Count the number of columns
        const pipes = (trimmedLine.match(/\|/g) || []).length;
        if (pipes < 2) return;
        
        const columns = pipes - 1;
        console.log('Detected table with', columns, 'columns');
        
        // Prevent the default Enter behavior
        event.preventDefault();
        event.stopPropagation();
        
        // Build the separator row: |---|---|...|
        const separator = '|' + Array(columns).fill('---').join('|') + '|';
        
        // Build the empty data row
        const emptyRow = '|' + Array(columns).fill('   ').join('|') + '|';
        
        // Get current markdown content
        if (!crepeInstance) {
            console.log('Crepe instance not available');
            return;
        }
        
        try {
            let currentMarkdown = crepeInstance.getMarkdown();
            console.log('Current markdown:', currentMarkdown);
            
            // Remove escape characters before pipes (Milkdown escapes | as \|)
            currentMarkdown = currentMarkdown.replace(/\\\|/g, '|');
            console.log('Unescaped markdown:', currentMarkdown);
            
            // Find the line with the table header and add separator after it
            // The current line should be the table header
            const lines = currentMarkdown.split('\n');
            const newLines = [];
            let inserted = false;
            
            for (let i = 0; i < lines.length; i++) {
                newLines.push(lines[i]);
                // Check if this line matches our table header (compare unescaped)
                const lineUnescaped = lines[i].trim();
                if (!inserted && lineUnescaped === trimmedLine) {
                    // Add separator and empty row after this line
                    newLines.push(separator);
                    newLines.push(emptyRow);
                    inserted = true;
                }
            }
            
            if (inserted) {
                const newMarkdown = newLines.join('\n');
                console.log('New markdown:', newMarkdown);
                
                // Destroy and recreate editor with new content
                await crepeInstance.destroy();
                crepeInstance = null;
                await initEditor(newMarkdown);
                
                console.log('Table created successfully');
            }
        } catch (e) {
            console.error('Failed to create table:', e);
        }
    }, true); // Use capture phase to handle before ProseMirror
}

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
                [CrepeFeature.CodeMirror]: false,  // Disable CodeMirror for simplicity
                [CrepeFeature.Latex]: false,  // Disable LaTeX for simplicity
            },
        });
        
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
        setupTableAutoComplete(editorEl);
        
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
            // Remove extra blank lines between list items (including nested lists)
            // Repeatedly apply until no more changes (handles all nesting levels)
            let prev;
            do {
                prev = markdown;
                // Any list item followed by blank lines and another list item
                markdown = markdown.replace(/^([ \t]*[-*+][ \t].*)(\n\n+)([ \t]*[-*+][ \t])/gm, '$1\n$3');
                markdown = markdown.replace(/^([ \t]*\d+\.[ \t].*)(\n\n+)([ \t]*[-*+\d])/gm, '$1\n$3');
            } while (markdown !== prev);
            return markdown;
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

    const confirmed = await ask('このノートを削除しますか？', {
        title: '削除の確認',
        kind: 'warning',
        okLabel: '削除',
        cancelLabel: 'キャンセル'
    });
    if (confirmed) {
        try {
            await invoke('delete_note', { noteId });
            // Close window after deletion
            const currentWindow = getCurrentWindow();
            await currentWindow.close();
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

// Setup settings
function setupSettings() {
    const settingsBtn = document.getElementById('btn-settings');
    const settingsPanel = document.getElementById('settings-panel');
    const lineHeightRange = document.getElementById('line-height-range');
    const lineHeightValue = document.getElementById('line-height-value');

    // Load saved setting
    const savedLineHeight = localStorage.getItem('note-line-height') || '1.4';
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
        localStorage.setItem('note-line-height', value);
    });
}

// Setup event listeners
function setupEventListeners() {
    setupSettings();
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

            await initEditor(noteData.content);
            
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
            await initEditor('');
        }
    } catch (error) {
        console.error('Failed to load note:', error);
        document.getElementById('editor').innerHTML = `<div style="padding: 20px; color: red;">エラー: ${error}</div>`;
    }

    setupEventListeners();
});
