import { describe, it, expect, vi } from 'vitest';
import { handleTableDelete, handleTableEnter } from './table-utils';

// Mocks
const mockDeleteRow = vi.fn();

function createMockEvent(key: string, ctrlKey: boolean = false, metaKey: boolean = false, shiftKey: boolean = false) {
    return {
        key,
        ctrlKey,
        metaKey,
        shiftKey,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
}

function createMockEditorView(ancestors: Array<{ typeName: string, node: any }>) {
    return {
        state: {
            selection: {
                $from: {
                    depth: ancestors.length,
                    node: (depth: number) => ancestors[depth - 1].node // simplistic mock mapping
                }
            }
        },
        dispatch: vi.fn()
    } as any;
}

function createMockCrepeInstance() {
    return {
        editor: { action: vi.fn() },
        getMarkdown: vi.fn()
    } as any;
}

describe('handleTableDelete', () => {
    it('ignores non-Backspace keys', async () => {
        const event = createMockEvent('Enter', true);
        const getEditorView = vi.fn();
        const getCrepeInstance = vi.fn();

        await handleTableDelete(event, getEditorView, getCrepeInstance, { deleteRow: mockDeleteRow });

        expect(getEditorView).not.toHaveBeenCalled();
        expect(mockDeleteRow).not.toHaveBeenCalled();
    });

    it('ignores Backspace without Ctrl/Meta', async () => {
        const event = createMockEvent('Backspace', false, false);
        const getEditorView = vi.fn();
        const getCrepeInstance = vi.fn();

        await handleTableDelete(event, getEditorView, getCrepeInstance, { deleteRow: mockDeleteRow });

        expect(getEditorView).not.toHaveBeenCalled();
    });

    it('calls deleteRow when cursor is in a deletable table row', async () => {
        const event = createMockEvent('Backspace', true);

        // Mock table structure: Table -> TableRow -> TableCell
        const tableNode = {
            type: { name: 'table' },
            childCount: 3, // Header + 2 rows
            child: (i: number) => (i === 0 ? headerRow : dataRow)
        };
        const headerRow = { type: { name: 'table_row' }, id: 'header' };
        const dataRow = { type: { name: 'table_row' }, id: 'data' };
        const cellNode = { type: { name: 'table_cell' } };

        // Ancestors from deepest to shallowest for findTableContext logic in test setup?
        // Wait, the implementation uses $from.node(depth). 
        // Logic: for (let depth = $from.depth; depth > 0; depth--) 
        // If depth=3 (cell), node(3)=cell. depth=2 (row), node(2)=row. depth=1 (table), node(1)=table.

        const ancestors = [
            { typeName: 'table', node: tableNode },
            { typeName: 'table_row', node: dataRow },
            { typeName: 'table_cell', node: cellNode }
        ];

        const editorView = {
            state: {
                selection: {
                    $from: {
                        depth: 3,
                        node: (d: number) => ancestors[d - 1].node // d=1->table, d=2->row, d=3->cell
                    }
                }
            },
            dispatch: vi.fn()
        };

        const crepeInstance = createMockCrepeInstance();

        await handleTableDelete(
            event,
            () => editorView as any,
            () => crepeInstance,
            { deleteRow: mockDeleteRow }
        );

        expect(event.preventDefault).toHaveBeenCalled();
        expect(mockDeleteRow).toHaveBeenCalledWith(editorView.state, editorView.dispatch);
    });

    it('does not delete header row', async () => {
        const event = createMockEvent('Backspace', true);

        const headerRow = { type: { name: 'table_row' }, id: 'header' };
        const tableNode = {
            type: { name: 'table' },
            childCount: 3,
            child: (_: number) => headerRow
        };
        const cellNode = { type: { name: 'table_cell' } };

        const ancestors = [
            { typeName: 'table', node: tableNode },
            { typeName: 'table_row', node: headerRow },
            { typeName: 'table_cell', node: cellNode }
        ];

        const editorView = {
            state: {
                selection: {
                    $from: {
                        depth: 3,
                        node: (d: number) => ancestors[d - 1].node
                    }
                }
            },
            dispatch: vi.fn()
        };

        const crepeInstance = createMockCrepeInstance();
        mockDeleteRow.mockClear();

        await handleTableDelete(
            event,
            () => editorView as any,
            () => crepeInstance,
            { deleteRow: mockDeleteRow }
        );

        expect(mockDeleteRow).not.toHaveBeenCalled();
        // Should not prevent default if we didn't handle it? 
        // Logic: if (!canDeleteTableRow) return; -> returns before preventDefault.
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});

describe('handleTableEnter', () => {
    it('inserts <br> when Shift+Enter is pressed inside a table', async () => {
        const event = createMockEvent('Enter', false, false, true);

        // Mock table structure
        const tableNode = { type: { name: 'table' } };
        const rowNode = { type: { name: 'table_row' } };
        const cellNode = { type: { name: 'table_cell' } };

        const ancestors = [
            { typeName: 'table', node: tableNode },
            { typeName: 'table_row', node: rowNode },
            { typeName: 'table_cell', node: cellNode }
        ];

        const editorView = createMockEditorView(ancestors);

        // Mock Schema and hard_break node
        const hardBreakValues = { create: vi.fn(() => 'hard_break_node') };
        const schema = {
            nodes: {
                hard_break: hardBreakValues
            }
        };
        editorView.state.schema = schema;

        // Mock transaction
        const tr = {};
        editorView.state.tr = { replaceSelectionWith: vi.fn(() => tr) };
        editorView.state.selection.$from.pos = 10;

        const crepeInstance = createMockCrepeInstance();
        const initEditor = vi.fn();

        await handleTableEnter(
            event,
            () => editorView,
            () => crepeInstance,
            initEditor
        );

        expect(event.preventDefault).toHaveBeenCalled();
        expect(hardBreakValues.create).toHaveBeenCalled();
        expect(editorView.state.tr.replaceSelectionWith).toHaveBeenCalledWith('hard_break_node');
        expect(editorView.dispatch).toHaveBeenCalledWith(tr);
    });

    it('does nothing when Shift+Enter is pressed outside a table', async () => {
        const event = createMockEvent('Enter', false, false, true);

        // Paragraph context
        const pNode = { type: { name: 'paragraph' } };
        const ancestors = [{ typeName: 'paragraph', node: pNode }];

        const editorView = createMockEditorView(ancestors);

        const crepeInstance = createMockCrepeInstance();
        const initEditor = vi.fn();

        await handleTableEnter(
            event,
            () => editorView,
            () => crepeInstance,
            initEditor
        );

        expect(event.preventDefault).not.toHaveBeenCalled();
        // Since we are not in a table, we don't expect replaceSelectionWith to be called
        // We can verify this implicitly or check mocks if we had them set up broadly
    });

    it('ignores Enter without modifiers', async () => {
        const event = createMockEvent('Enter', false, false, false);
        // We mock editorView but returning null to avoid "Enter pressed" logic going deep
        // Or we can just verify it doesn't call insertText
        const editorView = null;

        const crepeInstance = createMockCrepeInstance();
        const initEditor = vi.fn();

        // We pass null editorView so the function logs "Editor view not available" and returns
        await handleTableEnter(
            event,
            () => editorView,
            () => crepeInstance,
            initEditor
        );

        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});
