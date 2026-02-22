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

const isTauri = (): boolean => {
    return typeof window !== 'undefined' && (window as any).isTauri === true;
};

/**
 * Parse token from URL hash if returning from redirect flow
 */
export function checkRedirectResponse(): boolean {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token=') || hash.includes('error='))) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const error = params.get('error');

        if (accessToken) {
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
}

/**
 * Initialize Google APIs
 */
export async function initGoogleDrive(): Promise<void> {
    const clientId = getClientId();
    if (!clientId || clientId.includes('YOUR_CLIENT_ID')) {
        const errorMsg = `[SYNC] Client ID is missing or invalid: ${clientId ? 'SET (masked)' : 'UNSET'}`;
        console.warn(`[DEBUG] GoogleDriveService: ${errorMsg}`);
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('frontend_log', { level: 'warn', message: errorMsg });
        return;
    }

    if (isTauri()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('frontend_log', { level: 'info', message: `[SYNC] Initializing G-Drive for Tauri. Client IDs: WEB=${!!CLIENT_ID_WEB}, DESKTOP=${!!CLIENT_ID_DESKTOP}` });
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
                    gapi.client.setToken({ access_token: pendingToken });
                    pendingToken = null;
                    localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                }

                gapiInited = true;
                checkInit();
            } catch (e) {
                console.error('[DEBUG] GoogleDriveService: GAPI init failed:', e);
            }
        };

        const initGis = () => {
            try {
                const clientId = getClientId();
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: SCOPES,
                    callback: '', // defined later in signIn
                });
                gisInited = true;
                checkInit();
            } catch (e) {
                console.error('GIS init failed:', e);
            }
        };

        const pollScripts = setInterval(() => {
            if (typeof gapi !== 'undefined' && gapi.load && !gapiInited) {
                checkRedirectResponse();
                gapi.load('client', initGapi);
            }
            if (typeof google !== 'undefined' && google.accounts && !gisInited) {
                initGis();
            }

            if (gapiInited && gisInited) {
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
}

/**
 * PKCE Helpers
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);

    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return { verifier, challenge };
}

/**
 * Sign in to Google
 */
export async function signInGoogleDrive(silent = false, loginHint: string | null = null): Promise<any> {
    if (!gisInited || !tokenClient) {
        if (!gapiInited || !gisInited) {
            await initGoogleDrive();
        }
    }

    if (!tokenClient && !isTauri()) {
        throw new Error('Google Drive client (GIS) failed to initialize.');
    }

    // Use Authorization Code Flow with PKCE for Tauri
    if (isTauri() && !silent) {
        const { invoke } = await import('@tauri-apps/api/core');

        const redirectUri = 'http://localhost:51737/';
        await invoke('frontend_log', { level: 'info', message: '[SYNC] Starting Auth (PKCE) for WSL2/Desktop' });
        await invoke('frontend_log', { level: 'info', message: `[SYNC] redirect_uri set to: ${redirectUri}` });

        try {
            // 1. Generate PKCE
            const { verifier, challenge } = await generatePKCE();

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
            await invoke('frontend_log', { level: 'info', message: `[SYNC] Auth URL generated (client_id: ${CLIENT_ID_DESKTOP?.substring(0, 10)}...)` });

            // 3. Start loopback server and wait for code
            await invoke('frontend_log', { level: 'info', message: '[SYNC] Starting loopback server on 51737...' });
            const codePromise = invoke('start_google_auth_server');

            // 4. Open auth URL in system browser
            await invoke('frontend_log', { level: 'info', message: '[SYNC] Opening external browser...' });
            await invoke('open_external_url', { url: authUrl });

            const code = await codePromise;
            await invoke('frontend_log', { level: 'info', message: '[SYNC] Authorization code received from loopback server' });

            // 5. Exchange code for token
            await invoke('frontend_log', { level: 'info', message: '[SYNC] Exchanging code for token...' });
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: code as string,
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
                const errorLog = `[SYNC] Token exchange error: ${tokenData.error} - ${tokenData.error_description || 'no description'}`;
                await invoke('frontend_log', { level: 'error', message: errorLog });
                throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
            }

            const accessToken = tokenData.access_token;
            if (accessToken) {
                await invoke('frontend_log', { level: 'info', message: '[SYNC] Token exchange successful (Token received)' });
                gapi.client.setToken({ access_token: accessToken });
                localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                return { access_token: accessToken };
            } else {
                await invoke('frontend_log', { level: 'error', message: `[SYNC] No access token in response: ${JSON.stringify(tokenData).substring(0, 100)}...` });
                throw new Error('No access token received from Google');
            }
        } catch (e: any) {
            await invoke('frontend_log', { level: 'error', message: `[SYNC] Auth flow exception: ${e.message || e}` });
            throw e;
        }
    }

    return new Promise((resolve, reject) => {
        tokenClient.callback = async (resp: any) => {
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
}

/**
 * Sign out from Google
 */
export function signOutGoogleDrive(): void {
    if (gapi.client) {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken(null);
        }
    }
    localStorage.removeItem('markdown_editor_gdrive_enabled');
}

/**
 * Check if there was a previous session
 */
export function hasPreviousGoogleDriveSession(): boolean {
    return localStorage.getItem('markdown_editor_gdrive_enabled') === 'true';
}

/**
 * Find the sync file on Google Drive
 */
export async function findGoogleDriveSyncFile(): Promise<any> {
    const response = await gapi.client.drive.files.list({
        q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive',
    });
    const files = response.result.files;
    return files && files.length > 0 ? files[0] : null;
}

/**
 * Get current user email from Google Drive
 */
export async function getGoogleDriveUserInfo(): Promise<string | null> {
    if (!isGoogleDriveLoggedIn()) return null;
    try {
        const response = await gapi.client.drive.about.get({
            fields: 'user(emailAddress)'
        });
        return response.result.user.emailAddress;
    } catch (e) {
        console.error('Failed to get user info:', e);
        return null;
    }
}

/**
 * Read content from the sync file
 */
export async function readGoogleDriveSyncFile(fileId: string): Promise<any> {
    const response = await gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
    });
    return response.result;
}

/**
 * Create or update the sync file on Google Drive
 */
export async function saveToGoogleDrive(content: any): Promise<any> {
    const file = await findGoogleDriveSyncFile();
    const metadata = {
        name: SYNC_FILE_NAME,
        mimeType: 'application/json',
    };

    if (file) {
        return await gapi.client.request({
            path: `/upload/drive/v3/files/${file.id}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            body: JSON.stringify(content),
        });
    } else {
        const createResp = await gapi.client.drive.files.create({
            resource: metadata,
            fields: 'id',
        });
        return await gapi.client.request({
            path: `/upload/drive/v3/files/${createResp.result.id}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            body: JSON.stringify(content),
        });
    }
}

/**
 * Check if the user is currently logged in to Google Drive
 */
export function isGoogleDriveLoggedIn(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken() !== null;
}

