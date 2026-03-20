/* 
   ui.js  –  All DOM manipulation lives here.
   fetch.js and insert.js call these helpers
   instead of touching the DOM directly.
    */

//  Toast system 
const TOAST_ICONS = { success: '✅', error: '❌', info: 'ℹ️' };

/**
 * Show a slide-in toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration  ms before auto-dismiss (default 4000)
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${TOAST_ICONS[type] ?? '🔔'}</span>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

//  Button loading state 
/**
 * Toggle loading spinner on a button and disable/enable it.
 * @param {string|HTMLElement} btnOrId
 * @param {boolean} loading
 */
function setLoading(btnOrId, loading) {
    const btn = typeof btnOrId === 'string'
        ? document.getElementById(btnOrId)
        : btnOrId;
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
}

//  Enable / disable helpers 
function enableEl(id) {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
}
function disableEl(id) {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
}

//  Stepper 
/**
 * Advance the stepper to step n, marking previous steps completed.
 * @param {number} activeStep  1-based step number
 */
function activateStep(activeStep) {
    document.querySelectorAll('#stepper .step').forEach(stepEl => {
        const n = parseInt(stepEl.dataset.step, 10);
        stepEl.classList.remove('active', 'completed');
        if (n < activeStep) stepEl.classList.add('completed');
        if (n === activeStep) stepEl.classList.add('active');
    });
}

//  Wizard section switcher 
/**
 * Show one wizard section, hiding all others.
 * @param {string} sectionId  e.g. 'section-auth', 'section-fork', 'path-a', 'path-b'
 */
function showSection(sectionId) {
    document.querySelectorAll('.wizard-section').forEach(s => {
        s.classList.toggle('active', s.id === sectionId);
    });
}

/**
 * Select Path A or Path B, advancing the stepper to step 3.
 * Enables the fetch button for the chosen path.
 * @param {'a'|'b'} path
 */
function selectPath(path) {
    showSection(`path-${path}`);
    activateStep(3);
    // Enable the fetch button for the chosen path
    if (path === 'a') {
        enableEl('fetch_button');
    } else {
        enableEl('fetch_button_b');
    }
}

//  Reset entire UI to initial state 
function resetUI() {
    showSection('section-auth');
    activateStep(1);
    disableEl('auth_button');
    disableEl('fetch_button');
    disableEl('fetch_button_b');
    disableEl('insert_button');
    disableEl('insert_initial_button');
    disableEl('insert_final_button');
    disableEl('redirect_button_a');
    disableEl('redirect_button_b');
    document.getElementById('gm_day_a').value = '';
    document.getElementById('gm_day_b').value = '';
    document.getElementById('doc-id').value = '';
    clearDocIdValidation();
}

//  Real-time doc-id validation 
const DOC_ID_REGEX = /[-\w]{25,}/;

function validateDocId() {
    const input = document.getElementById('doc-id');
    const hint  = document.getElementById('doc-id-hint');
    const val   = input.value.trim();
    if (!val) {
        input.classList.remove('input-error', 'input-ok');
        hint.textContent = '';
        return false;
    }
    const valid = DOC_ID_REGEX.test(val);
    input.classList.toggle('input-error', !valid);
    input.classList.toggle('input-ok',    valid);
    hint.textContent = valid ? '' : 'Paste a valid Google Docs link or document ID.';
    return valid;
}

function clearDocIdValidation() {
    const input = document.getElementById('doc-id');
    const hint  = document.getElementById('doc-id-hint');
    if (input) { input.classList.remove('input-error', 'input-ok'); }
    if (hint)  { hint.textContent = ''; }
}

// Attach real-time validation
document.getElementById('doc-id').addEventListener('input', validateDocId);

//  Back buttons & path selection 
document.getElementById('path-a-btn').addEventListener('click', () => selectPath('a'));
document.getElementById('path-b-btn').addEventListener('click', () => selectPath('b'));
document.getElementById('back-from-a').addEventListener('click', () => {
    showSection('section-fork');
    activateStep(2);
});
document.getElementById('back-from-b').addEventListener('click', () => {
    showSection('section-fork');
    activateStep(2);
});

// Expose globally so other scripts can call them
window.showToast    = showToast;
window.setLoading   = setLoading;
window.enableEl     = enableEl;
window.disableEl    = disableEl;
window.activateStep = activateStep;
window.showSection  = showSection;
window.selectPath   = selectPath;
window.resetUI      = resetUI;
window.validateDocId = validateDocId;
