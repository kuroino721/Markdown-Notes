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

export const GoogleDriveService = {
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
    async signIn(silent = false) {
        if (!gisInited || !tokenClient) {
            console.log('GIS not inited, attempting to re-init...');
            await this.init();
        }

        if (!tokenClient) {
            throw new Error('Google Drive client (GIS) failed to initialize.');
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

            if (silent) {
                // Try to get token without showing any popup
                // If it fails, it will call the callback with an error, but no popup will appear
                tokenClient.requestAccessToken({ prompt: 'none' });
            } else {
                // For manual sign-in, show the account picker
                tokenClient.requestAccessToken({ prompt: 'select_account' });
            }
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
