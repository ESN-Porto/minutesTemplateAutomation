import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const $ = (id) => document.getElementById(id);
let supabaseConfig;
try {
  supabaseConfig = await fetch('/api/config', { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new Error('Sign-in is unavailable in this environment.');
    return response.json();
  });
} catch {
  $('auth_button').disabled = true;
  window.showToast('Sign-in is not configured in this environment.', 'error');
  throw new Error('Supabase public configuration is unavailable.');
}
const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
let accessToken = null;
let resultUrl = null;

function notify(message, type = 'info') { window.showToast(message, type); }

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${accessToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'The request could not be completed.');
    error.status = response.status;
    error.recovery = body.recovery;
    throw error;
  }
  return body;
}

function documentLink(label, url) {
  if (!url || !/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+/.test(url)) return null;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

async function showAuthorizedInterface(session) {
  if (session?.access_token === accessToken && $('section-action').classList.contains('active')) return;
  accessToken = session?.access_token || null;
  if (!accessToken) return showSignedOut();
  try {
    await api('/api/session');
    window.showSection('section-action');
    window.activateStep(2);
  } catch (error) {
    await supabase.auth.signOut();
    accessToken = null;
    window.showSection('section-auth');
    window.activateStep(1);
    notify(error.message, 'error');
    return;
  }
  try {
    const { meetings } = await api('/api/meetings');
    const select = $('gm_day');
    select.replaceChildren(new Option('Select a GM date...', '', true, true));
    for (const meeting of meetings) select.add(new Option(meeting.title, meeting.date));
    $('agenda-status').textContent = meetings.length ? 'Signed in. Select a meeting date.' : 'Signed in. No meeting dates are available.';
    $('generate_button').disabled = meetings.length === 0;
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      await supabase.auth.signOut();
      showSignedOut();
      notify(error.message, 'error');
      return;
    }
    $('agenda-status').textContent = 'Signed in. The agenda integration is not available yet.';
    $('generate_button').disabled = true;
  }
}

function showSignedOut() {
  accessToken = null;
  window.showSection('section-auth');
  window.activateStep(1);
  $('generate_button').disabled = true;
  $('redirect_button').disabled = true;
  $('generation-result').replaceChildren();
  resultUrl = null;
}

$('auth_button').addEventListener('click', async () => {
  window.setLoading('auth_button', true);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    if (error) return notify('Sign-in failed. Check your details and try again.', 'error');
    await showAuthorizedInterface(data.session);
  } catch {
    notify('Sign-in is unavailable. Try again later.', 'error');
  } finally {
    window.setLoading('auth_button', false);
  }
});

$('signout_button').addEventListener('click', async () => {
  await supabase.auth.signOut();
  showSignedOut();
});

$('generate_button').addEventListener('click', async () => {
  const date = $('gm_day').value;
  if (!date) return notify('Select a GM date first.', 'error');
  if (!window.confirm(`Generate new minutes for ${date}? This creates a new document each time.`)) return;
  $('generate_button').disabled = true;
  $('redirect_button').disabled = true;
  $('generation-result').replaceChildren();
  window.setLoading('generate_button', true);
  try {
    const result = await api('/api/generate', { method: 'POST', body: JSON.stringify({ date }) });
    if (!result.complete) throw Object.assign(new Error('The generated document is incomplete.'), { recovery: result });
    resultUrl = result.url;
    const link = documentLink('Open generated minutes ↗', resultUrl);
    if (link) $('generation-result').append(link);
    if (result.warnings?.length) {
      const note = document.createElement('p');
      note.textContent = 'Some fields were left blank; please review the document:';
      const list = document.createElement('ul');
      for (const warning of result.warnings) { const item = document.createElement('li'); item.textContent = warning; list.append(item); }
      $('generation-result').append(note, list);
    }
    $('redirect_button').disabled = !link;
    window.activateStep(3);
    notify('Minutes generated successfully.', 'info');
  } catch (error) {
    const message = document.createElement('p');
    message.textContent = error.message;
    $('generation-result').append(message);
    const recovery = error.recovery && documentLink('Open incomplete document for recovery ↗', error.recovery.url);
    if (recovery) $('generation-result').append(recovery);
    notify(error.message, 'error');
  } finally {
    window.setLoading('generate_button', false);
    $('generate_button').disabled = false;
  }
});

$('redirect_button').addEventListener('click', () => {
  const link = documentLink('Open generated minutes ↗', resultUrl);
  if (link) window.open(link.href, '_blank', 'noopener,noreferrer');
});

supabase.auth.onAuthStateChange((_event, session) => {
  accessToken = session?.access_token || null;
  if (!session) showSignedOut();
});

const { data: { session } } = await supabase.auth.getSession();
if (session) await showAuthorizedInterface(session);
