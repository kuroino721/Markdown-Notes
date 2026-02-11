import { describe, it, expect, vi } from 'vitest';
import { handleTableDelete } from './table-utils';

// Mocks
const mockDeleteRow = vi.fn();

function createMockEvent(key: string, ctrlKey: boolean = false, metaKey: boolean = false) {
    return {
        key,
        ctrlKey,
        metaKey,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
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
            child: (i: number) => headerRow
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
