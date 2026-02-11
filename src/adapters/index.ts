/**
 * Environment detection and adapter selector
 */

import { Adapter } from './types.js';

// @ts-ignore
export const isTauri = () => !!(window.IS_TAURI_ADAPTER || window.__TAURI_INTERNALS__ || window.__TAURI__);

let adapter: Adapter | null = null;

export async function getAdapter(): Promise<Adapter> {
    if (adapter) return adapter;

    if (isTauri()) {
        const { TauriAdapter } = await import('./tauri.js');
        adapter = TauriAdapter;
    } else {
        const { BrowserAdapter } = await import('./browser.js');
        adapter = BrowserAdapter;
    }

    if (!adapter) throw new Error('Failed to load adapter');
    return adapter;
}

// For convenience in places where we can't await easily (like event setups),
// but we'll try to use the async version as much as possible.
export { adapter };
