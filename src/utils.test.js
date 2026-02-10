import { describe, it, expect } from 'vitest';
import {
    escapeHtml,
    extractTitle,
    getPreviewText,
    removeExtraListBlankLines,
    getFileNameFromPath,
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

    it('truncates to 50 characters', () => {
        const longTitle = 'A'.repeat(100);
        expect(extractTitle(longTitle).length).toBe(50);
    });

    it('returns default for empty content', () => {
        expect(extractTitle('')).toBe('新しいノート');
    });

    it('returns default for null/undefined', () => {
        expect(extractTitle(null)).toBe('新しいノート');
        expect(extractTitle(undefined)).toBe('新しいノート');
    });

    it('returns default for whitespace-only content', () => {
        expect(extractTitle('   \n   \n   ')).toBe('新しいノート');
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

    it('truncates to 100 characters', () => {
        const longContent = 'A'.repeat(200);
        expect(getPreviewText(longContent).length).toBe(100);
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

// ── removeExtraListBlankLines ──────────────────────────

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
