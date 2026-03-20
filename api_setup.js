/* ──────────────────────────────────────────────
   api_setup.js  –  Google API initialisation &
   OAuth flow.  DOM manipulation via ui.js.
   ────────────────────────────────────────────── */

const CLIENT_ID = CONFIG.CLIENT_ID;
const API_KEY   = CONFIG.API_KEY;

const DISCOVERY_DRIVE  = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const DISCOVERY_SHEETS = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const DISCOVERY_DOCS   = 'https://docs.googleapis.com/$discovery/rest?version=v1';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly';

let tokenClient;
let gapiInited = false;
let gisInited  = false;

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DRIVE, DISCOVERY_SHEETS, DISCOVERY_DOCS],
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        enableEl('auth_button');
    }
}

function handleAuthClick() {
    setLoading('auth_button', true);

    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            setLoading('auth_button', false);
            showToast('Authentication failed. Please try again.', 'error');
            throw resp;
        }
        try {
            //console.log("Token callback successful, resp:", resp);
            //console.log("Calling populateDateSelectors...");
            await populateDateSelectors();
            //console.log("populateDateSelectors completed.");
        } catch (e) {
            console.error("Error inside token callback:", e);
        }
        setLoading('auth_button', false);
        // Advance to fork
        showSection('section-fork');
        activateStep(2);
    };

    const error_callback = (err) => {
        console.warn('GIS Error:', err);
        setLoading('auth_button', false);
        if (err && err.type === 'popup_closed') {
            showToast('Authentication cancelled.', 'info');
        } else if (err && err.type === 'popup_failed_to_open') {
            showToast('Popup blocked. Please allow popups for this site.', 'error');
        } else {
            showToast('Authentication failed.', 'error');
        }
    };

    tokenClient.error_callback = error_callback;

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent', error_callback });
    } else {
        tokenClient.requestAccessToken({ prompt: '', error_callback });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        resetUI();
        showToast('Signed out successfully.', 'info');
    }
}

document.getElementById('auth_button').addEventListener('click', handleAuthClick);

// All three sign-out buttons share the same handler
['signout_button', 'signout_button_a', 'signout_button_b'].forEach(id => {
    document.getElementById(id).addEventListener('click', handleSignoutClick);
});

// Redirect buttons
document.getElementById('redirect_button_a').addEventListener('click', () => {
    window.open(`https://docs.google.com/document/d/${copyId}/edit`, '_blank');
});
document.getElementById('redirect_button_b').addEventListener('click', () => {
    window.open(`https://docs.google.com/document/d/${copyId}/edit`, '_blank');
});

console.log('api_setup.js loaded');