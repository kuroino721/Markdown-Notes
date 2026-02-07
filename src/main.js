import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';

// Tauri imports
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { listen } from '@tauri-apps/api/event';

// Global state
let editor = null;
let currentFilePath = null;
let isModified = false;
let isEditorMode = false;
let currentMarkdown = '';

// Default content
const defaultContent = `# Welcome to Markdown Editor

Start typing your **Markdown** here!

## Features

- **WYSIWYG Editing**: Type and see instant formatting
- **Keyboard Shortcuts**: Ctrl+O to open, Ctrl+S to save, Ctrl+/ to toggle mode
- **Beautiful Dark Theme**: Easy on the eyes

## Try it out

1. Type \`# Heading\` to create a heading
2. Use \`**bold**\` and \`*italic*\` for emphasis
3. Create lists with \`-\` or \`1.\`

> This is a blockquote

\`\`\`
// Code blocks are supported too!
console.log("Hello, World!");
\`\`\`

## Table Example

| Column A | Column B |
|----------|----------|
| Data 1   | Data 2   |

Happy writing! ✨
`;

// Initialize editor
async function initEditor() {
    await initEditorWithContent(defaultContent);
}

// Initialize editor with specific content
async function initEditorWithContent(content) {
    editor = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, document.getElementById('editor'));
            ctx.set(defaultValueCtx, content);
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .create();

    currentMarkdown = content;
    console.log('Milkdown editor initialized');
    
    // Track changes via DOM mutation observer
    const editorEl = document.getElementById('editor');
    const observer = new MutationObserver(() => {
        setModified(true);
    });
    observer.observe(editorEl, { childList: true, subtree: true, characterData: true });
}

// Get current markdown content from editor
function getEditorMarkdown() {
    if (!editor) return currentMarkdown;
    
    try {
        // Get the editor DOM content and convert to markdown-like format
        const editorEl = document.getElementById('editor');
        const proseMirror = editorEl.querySelector('.ProseMirror');
        
        if (proseMirror) {
            // Extract text content with basic markdown formatting
            let markdown = '';
            const children = proseMirror.children;
            
            for (const child of children) {
                const tagName = child.tagName.toLowerCase();
                const text = child.textContent;
                
                if (tagName === 'h1') {
                    markdown += `# ${text}\n\n`;
                } else if (tagName === 'h2') {
                    markdown += `## ${text}\n\n`;
                } else if (tagName === 'h3') {
                    markdown += `### ${text}\n\n`;
                } else if (tagName === 'h4') {
                    markdown += `#### ${text}\n\n`;
                } else if (tagName === 'h5') {
                    markdown += `##### ${text}\n\n`;
                } else if (tagName === 'h6') {
                    markdown += `###### ${text}\n\n`;
                } else if (tagName === 'p') {
                    markdown += `${text}\n\n`;
                } else if (tagName === 'ul') {
                    const items = child.querySelectorAll('li');
                    for (const item of items) {
                        markdown += `- ${item.textContent}\n`;
                    }
                    markdown += '\n';
                } else if (tagName === 'ol') {
                    const items = child.querySelectorAll('li');
                    let i = 1;
                    for (const item of items) {
                        markdown += `${i}. ${item.textContent}\n`;
                        i++;
                    }
                    markdown += '\n';
                } else if (tagName === 'blockquote') {
                    markdown += `> ${text}\n\n`;
                } else if (tagName === 'pre') {
                    markdown += '```\n' + text + '\n```\n\n';
                } else if (tagName === 'hr') {
                    markdown += '---\n\n';
                } else if (tagName === 'table') {
                    const rows = child.querySelectorAll('tr');
                    for (let i = 0; i < rows.length; i++) {
                        const cells = rows[i].querySelectorAll('th, td');
                        const cellTexts = Array.from(cells).map(c => c.textContent);
                        markdown += '| ' + cellTexts.join(' | ') + ' |\n';
                        if (i === 0) {
                            markdown += '|' + cellTexts.map(() => '---').join('|') + '|\n';
                        }
                    }
                    markdown += '\n';
                } else {
                    markdown += `${text}\n\n`;
                }
            }
            
            currentMarkdown = markdown.trim();
            return currentMarkdown;
        }
    } catch (e) {
        console.error('Error getting markdown:', e);
    }
    
    return currentMarkdown;
}

// Update UI elements
function setModified(modified) {
    isModified = modified;
    const indicator = document.getElementById('modified-indicator');
    if (modified) {
        indicator.classList.remove('hidden');
    } else {
        indicator.classList.add('hidden');
    }
}

function setFileTitle(title) {
    document.getElementById('file-title').textContent = title;
}

// Toggle editor mode
async function toggleEditorMode() {
    isEditorMode = !isEditorMode;
    
    const editorEl = document.getElementById('editor');
    const sourceContainer = document.getElementById('source-editor-container');
    const sourceEditor = document.getElementById('source-editor');
    const modeIndicator = document.getElementById('mode-indicator');
    const toggleBtn = document.getElementById('btn-toggle-mode');
    
    if (isEditorMode) {
        // ... (existing code for switching to editor mode) ...
        // Get cursor position from ProseMirror before switching
        let cursorLineIndex = 0;
        let cursorOffsetInBlock = 0;
        
        try {
            const view = editor.ctx.get(editorViewCtx);
            const { from } = view.state.selection;
            const resolvedPos = view.state.doc.resolve(from);
            
            // Get the line number (paragraph/block index)
            cursorLineIndex = resolvedPos.index(0);
            
            // Get offset within the block
            cursorOffsetInBlock = resolvedPos.parentOffset;
        } catch (e) {
            console.log('Could not get cursor position:', e);
        }
        
        // Switch to source editor mode
        const markdown = getEditorMarkdown();
        sourceEditor.value = markdown;
        
        editorEl.classList.add('hidden');
        sourceContainer.classList.remove('hidden');
        modeIndicator.textContent = 'Editor';
        modeIndicator.classList.add('editor-mode');
        toggleBtn.querySelector('.label').textContent = 'Preview';
        toggleBtn.querySelector('.icon').textContent = '👁️';
        
        updateLineNumbers();
        sourceEditor.focus();
        
        // Set cursor position based on line index and offset
        const lines = markdown.split('\n');
        let charPos = 0;
        let targetLine = 0;
        
        // Find the character position for the target line
        let blockCount = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() !== '' || (i > 0 && lines[i-1].trim() === '')) {
                if (blockCount >= cursorLineIndex) {
                    targetLine = i;
                    break;
                }
                if (lines[i].trim() !== '') {
                    blockCount++;
                }
            }
            charPos += lines[i].length + 1; // +1 for newline
        }
        
        // Add offset to the calculating position
        const lineContent = lines[targetLine] || '';
        let prefixLength = 0;
        
        if (lineContent.startsWith('#')) {
            const match = lineContent.match(/^(#+\s+)/);
            if (match) prefixLength = match[1].length;
        } else if (lineContent.match(/^[-*]\s/)) {
            prefixLength = 2;
        } else if (lineContent.match(/^\d+\.\s/)) {
            const match = lineContent.match(/^(\d+\.\s)/);
            if (match) prefixLength = match[1].length;
        } else if (lineContent.startsWith('> ')) {
            prefixLength = 2;
        }
        
        const targetCharPos = Math.min(charPos + prefixLength + cursorOffsetInBlock, charPos + lineContent.length);
        
        sourceEditor.setSelectionRange(targetCharPos, targetCharPos);
        
        const lineHeight = parseInt(getComputedStyle(sourceEditor).lineHeight) || 22;
        sourceEditor.scrollTop = Math.max(0, targetLine * lineHeight - sourceEditor.clientHeight / 2);
    } else {
        // Switch back to WYSIWYG mode
        const markdown = sourceEditor.value;
        const cursorPos = sourceEditor.selectionStart;
        currentMarkdown = markdown;
        
        // Calculate line index and offset from cursor position
        const beforeCursor = markdown.substring(0, cursorPos);
        const linesBefore = beforeCursor.split('\n');
        const currentLineIndex = linesBefore.length - 1;
        const currentLineText = linesBefore[currentLineIndex];
        
        // Calculate pure text offset (excluding markdown syntax prefix)
        let prefixLength = 0;
        const fullLineText = markdown.split('\n')[currentLineIndex] || '';
        
        if (fullLineText.startsWith('#')) {
            const match = fullLineText.match(/^(#+\s+)/);
            if (match) prefixLength = match[1].length;
        } else if (fullLineText.match(/^[-*]\s/)) {
            prefixLength = 2;
        } else if (fullLineText.match(/^\d+\.\s/)) {
            const match = fullLineText.match(/^(\d+\.\s)/);
            if (match) prefixLength = match[1].length;
        } else if (fullLineText.startsWith('> ')) {
            prefixLength = 2;
        }
        
        // Calculate raw offset in the current line (including prefixes)
        const rawOffsetInLine = cursorPos - (beforeCursor.lastIndexOf('\n') + 1);
        
        // Calculate adjustment for inline markdown syntax before cursor
        // This is an approximation. We remove markdown syntax characters to match ProseMirror content.
        const textBeforeCursorInLine = fullLineText.substring(0, rawOffsetInLine);
        let adjustment = 0;
        
        // Count bold/italic markers (** or __ or * or _)
        const boldItalicMatches = textBeforeCursorInLine.match(/(\*\*|__|\*|_)/g);
        if (boldItalicMatches) {
            adjustment += boldItalicMatches.join('').length;
        }
        
        // Count code markers (`)
        const codeMatches = textBeforeCursorInLine.match(/`/g);
        if (codeMatches) {
            adjustment += codeMatches.join('').length;
        }
        
        // Count link syntax characters ([] and ())
        // This is tricky as we need to subtract the syntax but keep the text
        // Simple approximation: count [ ] ( ) characters
        const linkMatches = textBeforeCursorInLine.match(/[\[\]\(\)]/g);
        if (linkMatches) {
            adjustment += linkMatches.join('').length;
        }
        
        // Adjust for prefix
        if (rawOffsetInLine < prefixLength) {
            // Cursor is inside the prefix (e.g. inside "# ")
            // Map to start of block
            adjustment = rawOffsetInLine; 
        } else {
            adjustment += prefixLength;
        }
        
        let targetOffsetInBlock = Math.max(0, rawOffsetInLine - adjustment);
        
        // Calculate block index
        // Count non-empty lines before current line to estimate block index
        let blockIndex = 0;
        const lines = markdown.split('\n');
        for (let i = 0; i < currentLineIndex; i++) {
            if (lines[i].trim() !== '') {
                blockIndex++;
            }
        }
        
        editorEl.classList.remove('hidden');
        sourceContainer.classList.add('hidden');
        modeIndicator.textContent = 'WYSIWYG';
        modeIndicator.classList.remove('editor-mode');
        toggleBtn.querySelector('.label').textContent = 'Editor';
        toggleBtn.querySelector('.icon').textContent = '📝';
        
        // Recreate Milkdown editor with new content
        editorEl.innerHTML = '';
        await initEditorWithContent(markdown);
        
        // Restore cursor position in ProseMirror
        try {
            const view = editor.ctx.get(editorViewCtx);
            const doc = view.state.doc;
            
            // Resolve position by block index
            let currentBlockIdx = 0;
            let targetProseMirrorPos = null;
            let posCounter = 0; // Track position manually
            
            console.log('Restoring cursor:', { blockIndex, targetOffsetInBlock });
            
            // Iterate over top-level nodes directly
            doc.content.forEach((node) => {
                if (targetProseMirrorPos !== null) return;
                
                if (node.isBlock) {
                    if (currentBlockIdx === blockIndex) {
                        console.log('Found target block:', node.type.name, posCounter);
                        // Convert block-local offset to document absolute position
                        // posCounter is the start of the node (before open tag)
                        // +1 to get inside the node
                        targetProseMirrorPos = Math.min(posCounter + 1 + targetOffsetInBlock, posCounter + node.nodeSize - 1);
                    }
                    currentBlockIdx++;
                }
                posCounter += node.nodeSize;
            });
            
            if (targetProseMirrorPos !== null) {
                const tr = view.state.tr;
                const SelectionClass = view.state.selection.constructor;
                let selection;
                
                try {
                    const $pos = view.state.doc.resolve(targetProseMirrorPos);
                    selection = SelectionClass.near($pos);
                } catch (e) {
                    console.log('Selection creation failed', e);
                }
                
                if (selection) {
                    tr.setSelection(selection);
                    tr.scrollIntoView();
                    view.dispatch(tr);
                    view.focus();
                }
            }
        } catch (e) {
            console.error('Failed to restore cursor position:', e);
        }
    }
}

// Update line numbers
function updateLineNumbers() {
    const sourceEditor = document.getElementById('source-editor');
    const lineNumbers = document.getElementById('line-numbers');
    const lines = sourceEditor.value.split('\n');
    
    lineNumbers.innerHTML = lines.map(() => '<span class="line-number"></span>').join('');
}

// Handle table auto-completion
function handleTableAutoComplete(e) {
    if (e.key !== 'Enter') return;
    
    const sourceEditor = document.getElementById('source-editor');
    const value = sourceEditor.value;
    const cursorPos = sourceEditor.selectionStart;
    
    // Find the current line
    const beforeCursor = value.substring(0, cursorPos);
    const lines = beforeCursor.split('\n');
    const currentLine = lines[lines.length - 1];
    
    // Check if line matches table header pattern: | a | b |
    const tableHeaderRegex = /^\|(.+\|)+\s*$/;
    if (tableHeaderRegex.test(currentLine)) {
        e.preventDefault();
        
        // Parse the columns
        const columns = currentLine.split('|').filter(c => c.trim() !== '');
        const separatorLine = '|' + columns.map(() => '---|').join('');
        const emptyRow = '|' + columns.map(() => '   |').join('');
        
        // Insert separator and empty row
        const afterCursor = value.substring(cursorPos);
        const newContent = beforeCursor + '\n' + separatorLine + '\n' + emptyRow + afterCursor;
        
        sourceEditor.value = newContent;
        
        // Move cursor to the first cell of the new row
        const newCursorPos = cursorPos + separatorLine.length + emptyRow.length + 2;
        sourceEditor.setSelectionRange(newCursorPos - emptyRow.length + 1, newCursorPos - emptyRow.length + 1);
        
        updateLineNumbers();
        setModified(true);
    }
}

// File operations
async function openFile() {
    try {
        const filePath = await open({
            multiple: false,
            filters: [{
                name: 'Markdown',
                extensions: ['md', 'markdown', 'txt']
            }]
        });

        if (filePath) {
            const content = await readTextFile(filePath);
            currentFilePath = filePath;
            currentMarkdown = content;
            
            // If in editor mode, update textarea
            if (isEditorMode) {
                document.getElementById('source-editor').value = content;
                updateLineNumbers();
            } else {
                // Recreate editor with new content
                const editorEl = document.getElementById('editor');
                editorEl.innerHTML = '';
                await initEditorWithContent(content);
            }

            // Update UI
            const fileName = filePath.split(/[/\\]/).pop();
            setFileTitle(fileName);
            setModified(false);
        }
    } catch (error) {
        console.error('Failed to open file:', error);
    }
}

async function saveFile() {
    try {
        let targetPath = currentFilePath;

        if (!targetPath) {
            targetPath = await save({
                filters: [{
                    name: 'Markdown',
                    extensions: ['md']
                }],
                defaultPath: 'untitled.md'
            });
        }

        if (targetPath) {
            // Get markdown content
            let markdown = '';
            if (isEditorMode) {
                markdown = document.getElementById('source-editor').value;
            } else {
                markdown = getEditorMarkdown();
            }
            
            await writeTextFile(targetPath, markdown);
            currentFilePath = targetPath;
            
            const fileName = targetPath.split(/[/\\]/).pop();
            setFileTitle(fileName);
            setModified(false);
        }
    } catch (error) {
        console.error('Failed to save file:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('btn-open').addEventListener('click', openFile);
    document.getElementById('btn-save').addEventListener('click', saveFile);
    document.getElementById('btn-toggle-mode').addEventListener('click', toggleEditorMode);
    
    // Source editor events
    const sourceEditor = document.getElementById('source-editor');
    sourceEditor.addEventListener('input', () => {
        updateLineNumbers();
        setModified(true);
        currentMarkdown = sourceEditor.value;
    });
    sourceEditor.addEventListener('keydown', handleTableAutoComplete);
    sourceEditor.addEventListener('scroll', () => {
        // Sync line numbers scroll with editor
        document.getElementById('line-numbers').scrollTop = sourceEditor.scrollTop;
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            // Debug: log key info
            console.log('Ctrl+key pressed:', { key: e.key, code: e.code, keyCode: e.keyCode });
            
            const key = e.key.toLowerCase();
            // Check for / using both e.key and e.code (for Japanese keyboards)
            // Also check for common Japanese keyboard variations
            if (key === '/' || e.code === 'Slash' || e.keyCode === 191 || e.key === '・') {
                e.preventDefault();
                toggleEditorMode();
                return;
            }
            switch (key) {
                case 'o':
                    e.preventDefault();
                    openFile();
                    break;
                case 's':
                    e.preventDefault();
                    saveFile();
                    break;
            }
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await initEditor();
    setupEventListeners();
    
    // Listen for file open event from command line arguments
    listen('open-file', async (event) => {
        const filePath = event.payload;
        if (filePath) {
            try {
                const content = await readTextFile(filePath);
                currentFilePath = filePath;
                currentMarkdown = content;
                
                // Recreate editor with new content
                const editorEl = document.getElementById('editor');
                editorEl.innerHTML = '';
                await initEditorWithContent(content);
                
                // Update UI
                const fileName = filePath.split(/[/\\]/).pop();
                setFileTitle(fileName);
                setModified(false);
                
                console.log('Opened file from command line:', filePath);
            } catch (error) {
                console.error('Failed to open file from command line:', error);
            }
        }
    });
});

