/**
 * Utility functions for Markdown Editor
 * Pure functions extracted for testability
 */

export const DEFAULT_TITLE = '新しいノート';
export const MAX_TITLE_LENGTH = 50;
export const MAX_PREVIEW_LENGTH = 100;

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Raw text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return String(text).replace(/[&<>"']/g, (c) => map[c]);
}

/**
 * Extract title from markdown content.
 * Uses the first non-empty line, stripping leading # characters.
 * @param {string} content - Markdown content
 * @returns {string} Extracted title (max 50 chars) or default
 */
export function extractTitle(content) {
    const lines = (content || '').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            return trimmed.replace(/^#+\s*/, '').substring(0, MAX_TITLE_LENGTH);
        }
    }
    return DEFAULT_TITLE;
}

/**
 * Generate preview text from markdown content.
 * Strips markdown syntax and limits to 100 characters.
 * @param {string} content - Markdown content
 * @returns {string} Plain text preview
 */
export function getPreviewText(content) {
    return (content || '')
        .replace(/^#+\s*/gm, '')
        .replace(/\*\*|__|[*_`]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .substring(0, MAX_PREVIEW_LENGTH);
}

/**
 * Remove extra blank lines between list items in markdown.
 * Milkdown sometimes inserts extra blank lines between list items.
 * @param {string} markdown - Markdown content
 * @returns {string} Cleaned markdown
 */
export function removeExtraListBlankLines(markdown) {
    let prev;
    do {
        prev = markdown;
        // Regex explanation:
        // Group 1: Matches a list item (bullet or ordered) and its content.
        // Group 2: Matches 2 or more newlines (the extra blank lines).
        // Group 3: Matches the start of the next list item.
        // Replacement: Keeps the first item ($1), adds a single newline (\n), and keeps the start of the next item ($3).

        // Handle unordered lists (-, *, +)
        markdown = markdown.replace(/^([ \t]*[-*+][ \t].*)(\n\n+)([ \t]*[-*+][ \t])/gm, '$1\n$3');
        // Handle ordered lists (1., 2., etc.) and mixed list types
        markdown = markdown.replace(/^([ \t]*\d+\.[ \t].*)(\n\n+)([ \t]*[-*+\d])/gm, '$1\n$3');
    } while (markdown !== prev);
    return markdown;
}

/**
 * Extract filename (without extension) from a file path.
 * Handles both / and \ separators.
 * @param {string} filePath - Full file path
 * @returns {string} Filename without extension
 */
export function getFileNameFromPath(filePath) {
    return filePath.split(/[/\\]/).pop().replace(/\.[^.]+$/, '');
}

/**
 * Find table context from ancestor node information.
 * Traverses from deepest to shallowest to find table and table_row nodes.
 * @param {Array<{typeName: string, node: any}>} ancestors - Ancestor nodes from deepest to shallowest
 * @returns {{inTable: boolean, tableNode: any|null, tableRowNode: any|null}}
 */
export function findTableContext(ancestors) {
    let tableNode = null;
    let tableRowNode = null;
    for (const { typeName, node } of ancestors) {
        if (typeName === 'table_row' && !tableRowNode) {
            tableRowNode = node;
        }
        if (typeName === 'table') {
            tableNode = node;
            break;
        }
    }
    return { inTable: !!tableNode, tableNode, tableRowNode };
}

/**
 * Check if a table row can be deleted.
 * Rules:
 *   - Header row (first child of table) cannot be deleted
 *   - Table must have more than 2 rows (header + at least 2 data rows)
 * @param {object} tableNode - Object with childCount and child(index) method
 * @param {any} tableRowNode - The row node reference to check
 * @returns {boolean} Whether the row can be deleted
 */
export function canDeleteTableRow(tableNode, tableRowNode) {
    if (!tableNode || !tableRowNode) return false;
    // Header row (first row) cannot be deleted
    if (tableRowNode === tableNode.child(0)) return false;
    // Need at least header + 2 data rows to allow deletion
    if (tableNode.childCount <= 2) return false;
    return true;
}
