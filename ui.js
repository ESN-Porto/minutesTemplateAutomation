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
 * @param {string} sectionId  e.g. 'section-auth', 'section-action'
 */
function showSection(sectionId) {
    document.querySelectorAll('.wizard-section').forEach(s => {
        s.classList.toggle('active', s.id === sectionId);
    });
}

//  Reset entire UI to initial state 
function resetUI() {
    showSection('section-auth');
    activateStep(1);
    disableEl('auth_button');
    disableEl('generate_button');
    disableEl('redirect_button');
    document.getElementById('gm_day').value = '';
}



// Expose globally so other scripts can call them
window.showToast    = showToast;
window.setLoading   = setLoading;
window.enableEl     = enableEl;
window.disableEl    = disableEl;
window.activateStep = activateStep;
window.showSection  = showSection;
window.resetUI      = resetUI;
