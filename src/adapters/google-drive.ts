/**
 * Google Drive Sync Service
 * Handles OAuth authentication and file operations on Google Drive
 */

// Replace these with your own credentials from Google Cloud Console via .env file
const CLIENT_ID_DESKTOP = import.meta.env.VITE_GOOGLE_CLIENT_ID_DESKTOP;
const CLIENT_SECRET_DESKTOP = import.meta.env.VITE_GOOGLE_CLIENT_SECRET_DESKTOP;
const CLIENT_ID_WEB = import.meta.env.VITE_GOOGLE_CLIENT_ID_WEB;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const getClientId = () => isTauri() ? CLIENT_ID_DESKTOP : CLIENT_ID_WEB;

const SYNC_FILE_NAME = 'markdown_notes_sync.json';

// Import invoke for Tauri commands
let invoke: any;
if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    import('@tauri-apps/api/core').then(m => { invoke = m.invoke; });
}

// Global declarations for Google APIs
declare global {
    interface Window {
        IS_TAURI_ADAPTER?: boolean;
        __TAURI_INTERNALS__?: any;
        __TAURI__?: any;
    }
}
declare const gapi: any;
declare const google: any;

let tokenClient: any;
let gapiInited = false;
let gisInited = false;
let pendingToken: string | null = null;

const isTauri = () => !!(window.IS_TAURI_ADAPTER || window.__TAURI_INTERNALS__ || window.__TAURI__);

export const GoogleDriveService = {
    /**
     * Parse token from URL hash if returning from redirect flow
     */
    checkRedirectResponse(): boolean {
        const hash = window.location.hash;
        if (hash && (hash.includes('access_token=') || hash.includes('error='))) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const error = params.get('error');

            if (accessToken) {
                console.log('Detected access token in URL hash');
                pendingToken = accessToken;
                // Clear hash to avoid re-processing or leaking token
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                return true;
            }
            if (error) {
                console.error('OAuth redirect error:', error);
            }
        }
        return false;
    },

    /**
     * Initialize Google APIs
     */
    async init(): Promise<void> {
        const clientId = getClientId();
        console.log('[DEBUG] GoogleDriveService: init() called. CLIENT_ID:', clientId);
        if (!clientId || clientId.includes('YOUR_CLIENT_ID')) {
            console.warn('[DEBUG] GoogleDriveService: Google Drive Client ID is not set. Please check your .env file or environment variables.');
            return;
        }

        return new Promise((resolve) => {
            const checkInit = () => {
                if (gapiInited && gisInited) {
                    resolve();
                }
            };

            const initGapi = async () => {
                try {
                    await gapi.client.init({
                        apiKey: API_KEY,
                        discoveryDocs: [DISCOVERY_DOC],
                    });

                    if (pendingToken) {
                        console.log('[DEBUG] GoogleDriveService: Applying pending token from redirect');
                        gapi.client.setToken({ access_token: pendingToken });
                        pendingToken = null;
                        localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                    }

                    gapiInited = true;
                    console.log('[DEBUG] GoogleDriveService: GAPI inited');
                    checkInit();
                } catch (e) {
                    console.error('[DEBUG] GoogleDriveService: GAPI init failed:', e);
                }
            };

            const initGis = () => {
                try {
                    const clientId = getClientId();
                    console.log('Initializing GIS with CLIENT_ID:', clientId);
                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: SCOPES,
                        callback: '', // defined later in signIn
                    });
                    console.log('GIS tokenClient initialized:', !!tokenClient);
                    gisInited = true;
                    checkInit();
                } catch (e) {
                    console.error('GIS init failed:', e);
                }
            };

            const pollScripts = setInterval(() => {
                if (typeof gapi !== 'undefined' && gapi.load && !gapiInited) {
                    console.log('[DEBUG] GoogleDriveService: gapi loaded, calling load("client")');
                    this.checkRedirectResponse();
                    gapi.load('client', initGapi);
                }
                if (typeof google !== 'undefined' && google.accounts && !gisInited) {
                    console.log('[DEBUG] GoogleDriveService: google identity services loaded, initing GIS');
                    initGis();
                }

                if (gapiInited && gisInited) {
                    console.log('[DEBUG] GoogleDriveService: Both GAPI and GIS inited');
                    clearInterval(pollScripts);
                }
            }, 100);

            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(pollScripts);
                if (!gapiInited || !gisInited) {
                    console.error('[DEBUG] GoogleDriveService: Google API scripts failed to load in time', { gapiInited, gisInited });
                    resolve(); // Resolve anyway to avoid hanging
                }
            }, 10000);
        });
    },

    /**
     * PKCE Helpers
     */
    async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
        const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);

        const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        return { verifier, challenge };
    },

    /**
     * Sign in to Google
     */
    async signIn(silent = false, loginHint: string | null = null): Promise<any> {
        if (!gisInited || !tokenClient) {
            console.log('GIS not inited, attempting to re-init...');
            // In Tauri/Webview2, it's better to fail or wait if not inited 
            // than to await init() here which breaks the user gesture.
            if (!gapiInited || !gisInited) {
                // If not inited background, we might want to try one last time
                // but only if we haven't already.
                await this.init();
            }
        }

        if (!tokenClient && !isTauri()) {
            throw new Error('Google Drive client (GIS) failed to initialize.');
        }

        // Use Authorization Code Flow with PKCE for Tauri
        if (isTauri() && !silent) {
            const redirectUri = 'http://localhost:51737/';
            await invoke('frontend_log', { level: 'info', message: '[SYNC] Starting Auth (PKCE) for WSL2/Desktop' });
            await invoke('frontend_log', { level: 'info', message: `[SYNC] redirect_uri set to: ${redirectUri}` });

            try {
                // 1. Generate PKCE
                const { verifier, challenge } = await this.generatePKCE();

                // 2. Build Auth URL safely
                if (!CLIENT_ID_DESKTOP) {
                    throw new Error('Google CLIENT_ID_DESKTOP is missing. Please check your .env file.');
                }

                const params = new URLSearchParams({
                    client_id: CLIENT_ID_DESKTOP,
                    redirect_uri: redirectUri,
                    response_type: 'code',
                    scope: SCOPES,
                    prompt: 'select_account',
                    code_challenge: challenge,
                    code_challenge_method: 'S256'
                });
                const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

                console.log('[DEBUG] GoogleDriveService: Auth URL built', authUrl.substring(0, 50) + '...');

                // 3. Start loopback server and wait for code
                const codePromise = invoke('start_google_auth_server');

                // 4. Open auth URL in system browser
                await invoke('open_external_url', { url: authUrl });

                const code = await codePromise;
                console.log('[DEBUG] GoogleDriveService: Code received from loopback');

                // 5. Exchange code for token
                await invoke('frontend_log', { level: 'info', message: '[SYNC] Exchanging code for token...' });
                const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        code: code,
                        client_id: CLIENT_ID_DESKTOP,
                        client_secret: CLIENT_SECRET_DESKTOP,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code',
                        code_verifier: verifier,
                    }),
                });

                await invoke('frontend_log', { level: 'info', message: `[SYNC] Token exchange status: ${tokenResponse.status}` });
                const tokenData = await tokenResponse.json();

                if (tokenData.error) {
                    await invoke('frontend_log', { level: 'error', message: `[SYNC] Token exchange error response: ${JSON.stringify(tokenData)}` });
                    throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
                }

                const accessToken = tokenData.access_token;
                if (accessToken) {
                    await invoke('frontend_log', { level: 'info', message: '[SYNC] Token exchange successful' });
                    gapi.client.setToken({ access_token: accessToken });
                    localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                    return { access_token: accessToken };
                } else {
                    await invoke('frontend_log', { level: 'error', message: `[SYNC] No access token in response: ${JSON.stringify(tokenData)}` });
                    throw new Error('No access token received from Google');
                }
            } catch (e: any) {
                await invoke('frontend_log', { level: 'error', message: `[SYNC] Auth flow exception: ${e.message || e}` });
                throw e;
            }
            return new Promise(() => { });
        }

        return new Promise((resolve, reject) => {
            tokenClient.callback = async (resp: any) => {
                console.log('Google Auth Response received:', resp);
                if (resp.error !== undefined) {
                    console.error('Google Auth Error:', resp.error);
                    reject(resp);
                }
                localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                resolve(resp);
            };

            const options: any = {};
            if (silent) {
                options.prompt = 'none';
                if (loginHint) options.login_hint = loginHint;
            } else {
                options.prompt = 'select_account';
            }

            tokenClient.requestAccessToken(options);
        });
    },

    signOut(): void {
        if (gapi.client) {
            const token = gapi.client.getToken();
            if (token !== null) {
                google.accounts.oauth2.revoke(token.access_token);
                gapi.client.setToken(null);
            }
        }
        localStorage.removeItem('markdown_editor_gdrive_enabled');
    },

    hasPreviousSession(): boolean {
        return localStorage.getItem('markdown_editor_gdrive_enabled') === 'true';
    },

    /**
     * Find the sync file on Google Drive
     */
    async findSyncFile(): Promise<any> {
        console.log('[DEBUG] GoogleDriveService: findSyncFile() called');
        const response = await gapi.client.drive.files.list({
            q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
            fields: 'files(id, name)',
            spaces: 'drive',
        });
        const files = response.result.files;
        console.log(`[DEBUG] GoogleDriveService: findSyncFile() found ${files ? files.length : 0} files`);
        return files && files.length > 0 ? files[0] : null;
    },

    /**
     * Get current user email
     */
    async getUserInfo(): Promise<string | null> {
        if (!this.isLoggedIn()) return null;
        try {
            const response = await gapi.client.drive.about.get({
                fields: 'user(emailAddress)'
            });
            return response.result.user.emailAddress;
        } catch (e) {
            console.error('Failed to get user info:', e);
            return null;
        }
    },

    /**
     * Read content from the sync file
     */
    async readSyncFile(fileId: string): Promise<any> {
        console.log(`[DEBUG] GoogleDriveService: readSyncFile(${fileId})`);
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        console.log('[DEBUG] GoogleDriveService: readSyncFile() success');
        return response.result;
    },

    /**
     * Create or update the sync file on Google Drive
     */
    async saveToDrive(content: any): Promise<any> {
        console.log('[DEBUG] GoogleDriveService: saveToDrive()');
        const file = await this.findSyncFile();
        const metadata = {
            name: SYNC_FILE_NAME,
            mimeType: 'application/json',
        };

        if (file) {
            console.log(`[DEBUG] GoogleDriveService: Updating existing file ${file.id}`);
            // Update existing file
            return await gapi.client.request({
                path: `/upload/drive/v3/files/${file.id}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: JSON.stringify(content),
            });
        } else {
            console.log('[DEBUG] GoogleDriveService: Creating new sync file');
            // Create new file
            // First create metadata, then upload content
            const createResp = await gapi.client.drive.files.create({
                resource: metadata,
                fields: 'id',
            });
            console.log(`[DEBUG] GoogleDriveService: New file metadata created with ID ${createResp.result.id}`);
            return await gapi.client.request({
                path: `/upload/drive/v3/files/${createResp.result.id}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: JSON.stringify(content),
            });
        }
    },

    isLoggedIn(): boolean {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken() !== null;
    }
};
