/**
 * Google Drive Sync Service
 * Handles OAuth authentication and file operations on Google Drive
 */

// Replace these with your own credentials from Google Cloud Console via .env file
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

const SYNC_FILE_NAME = 'markdown_notes_sync.json';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let pendingToken = null;

const isTauri = () => !!(window.IS_TAURI_ADAPTER || window.__TAURI_INTERNALS__ || window.__TAURI__);

export const GoogleDriveService = {
    /**
     * Parse token from URL hash if returning from redirect flow
     */
    checkRedirectResponse() {
        const hash = window.location.hash;
        if (hash && (hash.includes('access_token=') || hash.includes('error='))) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const error = params.get('error');
            
            if (accessToken) {
                console.log('Detected access token in URL hash');
                pendingToken = accessToken;
                // Clear hash to avoid re-processing or leaking token
                window.history.replaceState(null, null, window.location.pathname + window.location.search);
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
    async init() {
        if (!CLIENT_ID || CLIENT_ID.includes('YOUR_CLIENT_ID')) {
            console.warn('Google Drive Client ID is not set. Please check your .env file.');
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
                        gapi.client.setToken({ access_token: pendingToken });
                        pendingToken = null;
                        localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                    }
                    
                    gapiInited = true;
                    checkInit();
                } catch (e) {
                    console.error('GAPI init failed:', e);
                }
            };

            const initGis = () => {
                try {
                    console.log('Initializing GIS with CLIENT_ID:', CLIENT_ID);
                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: CLIENT_ID,
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
                    this.checkRedirectResponse();
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
                    console.error('Google API scripts failed to load in time');
                    resolve(); // Resolve anyway to avoid hanging
                }
            }, 10000);
        });
    },

    /**
     * Sign in to Google
     */
    async signIn(silent = false, loginHint = null) {
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

        // Use Redirect Flow for Tauri to avoid popup blocking
        if (isTauri() && !silent) {
            console.log('Using Redirect Flow for Tauri');
            const redirectUri = window.location.origin + '/';
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(SCOPES)}&prompt=select_account`;
            window.location.assign(authUrl);
            return new Promise(() => {}); // Page will navigate
        }

        return new Promise((resolve, reject) => {
            tokenClient.callback = async (resp) => {
                console.log('Google Auth Response received:', resp);
                if (resp.error !== undefined) {
                    console.error('Google Auth Error:', resp.error);
                    reject(resp);
                }
                localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
                resolve(resp);
            };

            const options = {};
            if (silent) {
                options.prompt = 'none';
                if (loginHint) options.login_hint = loginHint;
            } else {
                options.prompt = 'select_account';
            }
            
            tokenClient.requestAccessToken(options);
        });
    },

    signOut() {
        if (gapi.client) {
            const token = gapi.client.getToken();
            if (token !== null) {
                google.accounts.oauth2.revoke(token.access_token);
                gapi.client.setToken(null);
            }
        }
        localStorage.removeItem('markdown_editor_gdrive_enabled');
    },

    hasPreviousSession() {
        return localStorage.getItem('markdown_editor_gdrive_enabled') === 'true';
    },

    /**
     * Find the sync file on Google Drive
     */
    async findSyncFile() {
        const response = await gapi.client.drive.files.list({
            q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
            fields: 'files(id, name)',
            spaces: 'drive',
        });
        const files = response.result.files;
        return files && files.length > 0 ? files[0] : null;
    },

    /**
     * Get current user email
     */
    async getUserInfo() {
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
    async readSyncFile(fileId) {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media',
        });
        return response.result;
    },

    /**
     * Create or update the sync file on Google Drive
     */
    async saveToDrive(content) {
        const file = await this.findSyncFile();
        const metadata = {
            name: SYNC_FILE_NAME,
            mimeType: 'application/json',
        };

        if (file) {
            // Update existing file
            return await gapi.client.request({
                path: `/upload/drive/v3/files/${file.id}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: JSON.stringify(content),
            });
        } else {
            // Create new file
            // First create metadata, then upload content
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
    },

    isLoggedIn() {
        return typeof gapi !== 'undefined' && gapi.client && gapi.client.getToken() !== null;
    }
};
