/**
 * Environment detection and adapter selector
 */

export const isTauri = () => !!(window.__TAURI_INTERNALS__ || window.__TAURI__);

let adapter = null;

export async function getAdapter() {
    if (adapter) return adapter;

    if (isTauri()) {
        const { TauriAdapter } = await import('./tauri.js');
        adapter = TauriAdapter;
    } else {
        const { BrowserAdapter } = await import('./browser.js');
        adapter = BrowserAdapter;
    }

    return adapter;
}

// For convenience in places where we can't await easily (like event setups),
// but we'll try to use the async version as much as possible.
export { adapter };
