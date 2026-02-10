/**
 * Utility functions for Markdown Editor
 * Pure functions extracted for testability
 */

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
            return trimmed.replace(/^#+\s*/, '').substring(0, 50);
        }
    }
    return '新しいノート';
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
        .substring(0, 100);
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
        markdown = markdown.replace(/^([ \t]*[-*+][ \t].*)(\n\n+)([ \t]*[-*+][ \t])/gm, '$1\n$3');
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
