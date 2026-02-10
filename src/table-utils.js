import { findTableContext, canDeleteTableRow } from './utils.js';

export function setupTableAutoComplete(editorElement, getEditorView, getCrepeInstance, initEditor) {
    // Ctrl+Backspace: Delete row in table
    editorElement.addEventListener('keydown', (event) => {
        if (event.key !== 'Backspace' || !(event.ctrlKey || event.metaKey)) {
            return;
        }
        
        const editorView = getEditorView();
        const crepeInstance = getCrepeInstance();

        if (!editorView || !crepeInstance) return;

        const { state } = editorView;
        const { $from } = state.selection;

        // Collect ancestor nodes
        const ancestors = [];
        for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            ancestors.push({ typeName: node.type.name, node });
        }

        const { inTable, tableNode, tableRowNode } = findTableContext(ancestors);
        if (!inTable) return;
        if (!canDeleteTableRow(tableNode, tableRowNode)) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        import('@milkdown/prose/tables').then(({ deleteRow }) => {
            deleteRow(editorView.state, editorView.dispatch);
        }).catch(err => {
            console.error('Failed to delete table row:', err);
        });
    }, true);

    // Enter key: Table auto-complete & Ctrl+Enter row addition
    editorElement.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter' || event.shiftKey) {
            return;
        }

        const editorView = getEditorView();
        const crepeInstance = getCrepeInstance();

        // Ctrl+Enter: Add row in table
        if (event.ctrlKey || event.metaKey) {
            if (!editorView || !crepeInstance) return;

            const { state } = editorView;
            const { $from } = state.selection;

            // Collect ancestor nodes
            const ancestors = [];
            for (let depth = $from.depth; depth > 0; depth--) {
                const node = $from.node(depth);
                ancestors.push({ typeName: node.type.name, node });
            }

            const { inTable } = findTableContext(ancestors);
            if (!inTable) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                const { commandsCtx } = await import('@milkdown/core');
                const { addRowAfterCommand } = await import('@milkdown/preset-gfm');
                crepeInstance.editor.action((ctx) => {
                    const commands = ctx.get(commandsCtx);
                    commands.call(addRowAfterCommand.key);
                });
            } catch (e) {
                console.error('Failed to add table row:', e);
            }
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
                await initEditor(newMarkdown);
                
                console.log('Table created successfully');
            }
        } catch (e) {
            console.error('Failed to create table:', e);
        }
    }, true); // Use capture phase to handle before ProseMirror
}
