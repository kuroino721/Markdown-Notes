import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    escapeHtml,
    extractTitle,
    getPreviewText,
    renderMarkdown,
    removeExtraListBlankLines,
    getFileNameFromPath,
    findTableContext,
    canDeleteTableRow,
    resolveRelativeUrl,
    DEFAULT_TITLE,
    MAX_TITLE_LENGTH,
    MAX_PREVIEW_LENGTH,
} from './utils.js';

// ── escapeHtml ─────────────────────────────────────────

describe('escapeHtml', () => {
    it('escapes ampersand', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes angle brackets', () => {
        expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe("it&#039;s");
    });

    it('escapes multiple special characters', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        );
    });

    it('returns empty string for empty input', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('passes through plain text unchanged', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
    });

    it('handles Japanese characters', () => {
        expect(escapeHtml('こんにちは')).toBe('こんにちは');
    });
});

// ── extractTitle ───────────────────────────────────────

describe('extractTitle', () => {
    it('extracts title from first line', () => {
        expect(extractTitle('My Title\nSome content')).toBe('My Title');
    });

    it('strips markdown heading markers', () => {
        expect(extractTitle('# Heading\ncontent')).toBe('Heading');
    });

    it('strips multiple heading levels', () => {
        expect(extractTitle('### Deep Heading')).toBe('Deep Heading');
    });

    it('skips empty lines to find title', () => {
        expect(extractTitle('\n\n  \nActual Title')).toBe('Actual Title');
    });

    it('truncates to MAX_TITLE_LENGTH characters', () => {
        const longTitle = 'A'.repeat(MAX_TITLE_LENGTH * 2);
        expect(extractTitle(longTitle).length).toBe(MAX_TITLE_LENGTH);
    });

    it('returns default for empty content', () => {
        expect(extractTitle('')).toBe(DEFAULT_TITLE);
    });

    it('returns default for null/undefined', () => {
        expect(extractTitle(null)).toBe(DEFAULT_TITLE);
        expect(extractTitle(undefined)).toBe(DEFAULT_TITLE);
    });

    it('returns default for whitespace-only content', () => {
        expect(extractTitle('   \n   \n   ')).toBe(DEFAULT_TITLE);
    });
});

// ── getPreviewText ─────────────────────────────────────

describe('getPreviewText', () => {
    it('strips heading markers', () => {
        expect(getPreviewText('# Hello')).toBe('Hello');
    });

    it('strips bold markers', () => {
        expect(getPreviewText('**bold** text')).toBe('bold text');
    });

    it('strips italic markers', () => {
        expect(getPreviewText('*italic* text')).toBe('italic text');
    });

    it('strips inline code markers', () => {
        expect(getPreviewText('use `code` here')).toBe('use code here');
    });

    it('converts links to text', () => {
        expect(getPreviewText('[click here](http://example.com)')).toBe('click here');
    });

    it('truncates to MAX_PREVIEW_LENGTH characters', () => {
        const longContent = 'A'.repeat(MAX_PREVIEW_LENGTH * 2);
        expect(getPreviewText(longContent).length).toBe(MAX_PREVIEW_LENGTH);
    });

    it('handles empty content', () => {
        expect(getPreviewText('')).toBe('');
    });

    it('handles null/undefined', () => {
        expect(getPreviewText(null)).toBe('');
        expect(getPreviewText(undefined)).toBe('');
    });

    it('strips multiple markdown elements', () => {
        const md = '# Title\n**bold** and *italic*\n[link](url)';
        const result = getPreviewText(md);
        expect(result).not.toContain('#');
        expect(result).not.toContain('**');
        expect(result).not.toContain('*');
        expect(result).not.toContain('[');
        expect(result).not.toContain('](');
    });
});

// ── renderMarkdown ─────────────────────────────────────
describe('renderMarkdown', () => {
    it('renders basic markdown to HTML', () => {
        const result = renderMarkdown('# Hello\n**bold**');
        expect(result).toContain('<h1>Hello</h1>');
        expect(result).toContain('<strong>bold</strong>');
    });

    it('renders lists', () => {
        const result = renderMarkdown('- item 1\n- item 2');
        expect(result).toContain('<ul>');
        expect(result).toContain('<li>item 1</li>');
    });

    it('handles empty content', () => {
        expect(renderMarkdown('')).toBe('');
    });

    it('handles null content (via type coercion or if passed indirectly)', () => {
        // @ts-ignore
        expect(renderMarkdown(null)).toBe('');
    });
});

describe('removeExtraListBlankLines', () => {
    it('removes blank lines between unordered list items', () => {
        const input = '- item 1\n\n- item 2';
        expect(removeExtraListBlankLines(input)).toBe('- item 1\n- item 2');
    });

    it('removes multiple blank lines between list items', () => {
        const input = '- item 1\n\n\n\n- item 2';
        expect(removeExtraListBlankLines(input)).toBe('- item 1\n- item 2');
    });

    it('handles ordered list items', () => {
        const input = '1. first\n\n2. second';
        // The regex handles ordered to unordered/ordered transitions
        expect(removeExtraListBlankLines(input)).toBe('1. first\n2. second');
    });

    it('preserves single newlines between list items', () => {
        const input = '- item 1\n- item 2';
        expect(removeExtraListBlankLines(input)).toBe('- item 1\n- item 2');
    });

    it('handles nested list items', () => {
        const input = '- item 1\n\n  - nested';
        expect(removeExtraListBlankLines(input)).toBe('- item 1\n  - nested');
    });

    it('handles mixed list markers', () => {
        const input = '* item 1\n\n+ item 2\n\n- item 3';
        expect(removeExtraListBlankLines(input)).toBe('* item 1\n+ item 2\n- item 3');
    });

    it('does not affect non-list content', () => {
        const input = 'paragraph 1\n\nparagraph 2';
        expect(removeExtraListBlankLines(input)).toBe('paragraph 1\n\nparagraph 2');
    });

    it('handles empty string', () => {
        expect(removeExtraListBlankLines('')).toBe('');
    });
});

// ── getFileNameFromPath ────────────────────────────────

describe('getFileNameFromPath', () => {
    it('extracts filename from Windows path', () => {
        expect(getFileNameFromPath('C:\\Users\\file.md')).toBe('file');
    });

    it('extracts filename from Unix path', () => {
        expect(getFileNameFromPath('/home/user/file.md')).toBe('file');
    });

    it('extracts filename from mixed path', () => {
        expect(getFileNameFromPath('C:\\Users/docs/file.txt')).toBe('file');
    });

    it('handles filename without extension', () => {
        expect(getFileNameFromPath('README')).toBe('README');
    });

    it('handles filename with multiple dots', () => {
        expect(getFileNameFromPath('my.file.name.md')).toBe('my.file.name');
    });

    it('extracts Japanese filename', () => {
        expect(getFileNameFromPath('C:\\ドキュメント\\メモ.md')).toBe('メモ');
    });
});

// ── findTableContext ──────────────────────────────────

describe('findTableContext', () => {
    it('detects table context from ancestors', () => {
        const tableNode = { id: 'table' };
        const rowNode = { id: 'row' };
        const ancestors = [
            { typeName: 'table_cell', node: { id: 'cell' } },
            { typeName: 'table_row', node: rowNode },
            { typeName: 'table', node: tableNode },
        ];
        const result = findTableContext(ancestors);
        expect(result.inTable).toBe(true);
        expect(result.tableNode).toBe(tableNode);
        expect(result.tableRowNode).toBe(rowNode);
    });

    it('returns not in table when no table ancestor', () => {
        const ancestors = [
            { typeName: 'paragraph', node: { id: 'p' } },
            { typeName: 'doc', node: { id: 'doc' } },
        ];
        const result = findTableContext(ancestors);
        expect(result.inTable).toBe(false);
        expect(result.tableNode).toBeNull();
        expect(result.tableRowNode).toBeNull();
    });

    it('handles empty ancestors array', () => {
        const result = findTableContext([]);
        expect(result.inTable).toBe(false);
        expect(result.tableNode).toBeNull();
        expect(result.tableRowNode).toBeNull();
    });

    it('finds first table_row encountered (deepest)', () => {
        const innerRow = { id: 'inner_row' };
        const outerRow = { id: 'outer_row' };
        const ancestors = [
            { typeName: 'table_cell', node: { id: 'cell' } },
            { typeName: 'table_row', node: innerRow },
            { typeName: 'table_row', node: outerRow },
            { typeName: 'table', node: { id: 'table' } },
        ];
        const result = findTableContext(ancestors);
        expect(result.tableRowNode).toBe(innerRow);
    });

    it('stops at first table node', () => {
        const innerTable = { id: 'inner_table' };
        const ancestors = [
            { typeName: 'table_cell', node: { id: 'cell' } },
            { typeName: 'table_row', node: { id: 'row' } },
            { typeName: 'table', node: innerTable },
            { typeName: 'table', node: { id: 'outer_table' } },
        ];
        const result = findTableContext(ancestors);
        expect(result.tableNode).toBe(innerTable);
    });

    it('handles table without table_row (edge case)', () => {
        const ancestors = [
            { typeName: 'table_cell', node: { id: 'cell' } },
            { typeName: 'table', node: { id: 'table' } },
        ];
        const result = findTableContext(ancestors);
        expect(result.inTable).toBe(true);
        expect(result.tableRowNode).toBeNull();
    });
});

// ── canDeleteTableRow ─────────────────────────────────

describe('canDeleteTableRow', () => {
    // Helper to create a mock table node
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function makeTable(rows: any[]) {
        return {
            childCount: rows.length,
            child: (i: number) => rows[i],
        };
    }

    it('allows deleting a non-header row when table has 3+ rows', () => {
        const headerRow = { id: 'header' };
        const dataRow1 = { id: 'data1' };
        const dataRow2 = { id: 'data2' };
        const table = makeTable([headerRow, dataRow1, dataRow2]);
        expect(canDeleteTableRow(table, dataRow1)).toBe(true);
        expect(canDeleteTableRow(table, dataRow2)).toBe(true);
    });

    it('prevents deleting header row (first row)', () => {
        const headerRow = { id: 'header' };
        const dataRow1 = { id: 'data1' };
        const dataRow2 = { id: 'data2' };
        const table = makeTable([headerRow, dataRow1, dataRow2]);
        expect(canDeleteTableRow(table, headerRow)).toBe(false);
    });

    it('allows deleting when table has only 2 rows (header + 1 data)', () => {
        const headerRow = { id: 'header' };
        const dataRow = { id: 'data' };
        const table = makeTable([headerRow, dataRow]);
        expect(canDeleteTableRow(table, dataRow)).toBe(true);
    });

    it('prevents deleting header row even if only row', () => {
        const headerRow = { id: 'header' };
        const table = makeTable([headerRow]);
        expect(canDeleteTableRow(table, headerRow)).toBe(false);
    });

    it('returns false when tableNode is null', () => {
        expect(canDeleteTableRow(null, { id: 'row' })).toBe(false);
    });

    it('returns false when tableRowNode is null', () => {
        const table = makeTable([{ id: 'header' }, { id: 'data' }]);
        expect(canDeleteTableRow(table, null)).toBe(false);
    });

    it('returns false when both are null', () => {
        expect(canDeleteTableRow(null, null)).toBe(false);
    });

    it('allows deleting last data row when table has 4 rows', () => {
        const rows = [{ id: 'h' }, { id: 'd1' }, { id: 'd2' }, { id: 'd3' }];
        const table = makeTable(rows);
        expect(canDeleteTableRow(table, rows[3])).toBe(true);
    });
});

// ── resolveRelativeUrl ────────────────────────────────

describe('resolveRelativeUrl', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        // @ts-ignore
        delete window.location;
        window.location = { ...originalLocation, origin: 'https://example.com' } as any;
    });

    afterEach(() => {
        window.location = originalLocation;
    });

    it('resolves path with single slash base', () => {
        expect(resolveRelativeUrl('note.html', { baseUrl: '/' })).toBe('https://example.com/note.html');
    });

    it('resolves path with subfolder base', () => {
        expect(resolveRelativeUrl('note.html', { baseUrl: '/Markdown-Notes/' })).toBe('https://example.com/Markdown-Notes/note.html');
    });

    it('resolves path with subfolder base missing trailing slash', () => {
        expect(resolveRelativeUrl('note.html', { baseUrl: '/Markdown-Notes' })).toBe('https://example.com/Markdown-Notes/note.html');
    });

    it('handles absolute-like paths by prefixing with base', () => {
        expect(resolveRelativeUrl('sub/page.html', { baseUrl: '/app/' })).toBe('https://example.com/app/sub/page.html');
    });

    it('handles root-relative input path by ignoring base (URL standard behavior)', () => {
        // /path is root-relative, so it ignores the /app/ base
        expect(resolveRelativeUrl('/root.html', { baseUrl: '/app/' })).toBe('https://example.com/root.html');
    });
});
