const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadCredentials(env = process.env) {
  const json = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const filename = env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if ((!json && !filename) || (json && filename)) {
    const error = new Error('Configure exactly one Google service-account credential source.');
    error.code = 'GOOGLE_CONFIG_MISSING';
    throw error;
  }
  let credentials;
  try {
    const serialized = json || fs.readFileSync(path.resolve(process.cwd(), filename), 'utf8');
    credentials = JSON.parse(serialized);
  } catch {
    const error = new Error('Google integration credentials are invalid.');
    error.code = 'GOOGLE_CONFIG_INVALID';
    throw error;
  }
  if (!credentials.client_email || !credentials.private_key) {
    const error = new Error('Google integration credentials are invalid.');
    error.code = 'GOOGLE_CONFIG_INVALID';
    throw error;
  }
  return credentials;
}

function createGoogleServices(env = process.env, deps = {}) {
  const { GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_SPREADSHEET_ID, GOOGLE_TEMPLATE_ID, GOOGLE_DESTINATION_FOLDER_ID } = env;
  if ((!GOOGLE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_SERVICE_ACCOUNT_FILE) || !GOOGLE_SPREADSHEET_ID || !GOOGLE_TEMPLATE_ID || !GOOGLE_DESTINATION_FOLDER_ID) {
    const error = new Error('Google integration is not configured.');
    error.code = 'GOOGLE_CONFIG_MISSING';
    throw error;
  }
  const credentials = loadCredentials(env);
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/documents',
  ];
  const fetchFn = deps.fetchFn || fetch;
  let cachedToken;
  let expiresAt = 0;
  async function token() {
    if (deps.tokenProvider) return deps.tokenProvider();
    if (cachedToken && Date.now() < expiresAt - 60000) return cachedToken;
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token';
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: credentials.client_email, scope: scopes.join(' '), aud: tokenUri, iat: now, exp: now + 3600 })}`;
    const assertion = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url')}`;
    const response = await fetchFn(tokenUri, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Google authentication failed.');
    const result = await response.json();
    if (!result.access_token) throw new Error('Google authentication failed.');
    cachedToken = result.access_token;
    expiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
    return cachedToken;
  }
  async function request(url, options = {}) {
    const response = await fetchFn(url, {
      ...options,
      headers: { Authorization: `Bearer ${await token()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const error = new Error('Google could not complete the request. Check the service account access and API configuration.');
      error.status = 502; error.code = 'GOOGLE_API_ERROR'; error.safeToExpose = true;
      throw error;
    }
    return { data: await response.json() };
  }
  const enc = encodeURIComponent;
  return {
    sheets: { spreadsheets: {
      get: ({ spreadsheetId, fields }) => request(`https://sheets.googleapis.com/v4/spreadsheets/${enc(spreadsheetId)}?${new URLSearchParams({ fields })}`),
      values: { batchGet: ({ spreadsheetId, ranges, valueRenderOption }) => {
        const query = new URLSearchParams();
        for (const range of ranges) query.append('ranges', range);
        if (valueRenderOption) query.set('valueRenderOption', valueRenderOption);
        return request(`https://sheets.googleapis.com/v4/spreadsheets/${enc(spreadsheetId)}/values:batchGet?${query}`);
      } },
    } },
    drive: { files: { copy: ({ fileId, supportsAllDrives, fields, requestBody }) => {
      const query = new URLSearchParams({ supportsAllDrives: String(supportsAllDrives), fields });
      return request(`https://www.googleapis.com/drive/v3/files/${enc(fileId)}/copy?${query}`, { method: 'POST', body: JSON.stringify(requestBody) });
    } } },
    docs: { documents: {
      get: ({ documentId }) => request(`https://docs.googleapis.com/v1/documents/${enc(documentId)}`),
      batchUpdate: ({ documentId, requestBody }) => request(`https://docs.googleapis.com/v1/documents/${enc(documentId)}:batchUpdate`, { method: 'POST', body: JSON.stringify(requestBody) }),
    } },
    config: { spreadsheetId: GOOGLE_SPREADSHEET_ID, templateId: GOOGLE_TEMPLATE_ID, folderId: GOOGLE_DESTINATION_FOLDER_ID },
  };
}

function replacementRequests(meeting) {
  const attendeeGroups = meeting.attendeesByCategory || {};
  const flat = {
    DATE: meeting.date, START: meeting.start, END: meeting.end,
    'MAIN CHAIR': meeting.chairingTeam.mainChair, SPEAKERS: meeting.chairingTeam.speakers, MINUTES: meeting.chairingTeam.minutes,
    'NEXT MAIN CHAIR': meeting.nextChairingTeam.mainChair, 'NEXT SPEAKERS': meeting.nextChairingTeam.speakers, 'NEXT MINUTES': meeting.nextChairingTeam.minutes,
    'TOPIC LIST': meeting.topics.map((topic) => topic.title).join('\n'),
  };
  for (const [key, value] of Object.entries(attendeeGroups)) {
    const normalized = key.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const token = normalized === 'NEW MEMBERS' ? 'NEWMEMBERS' : normalized;
    flat[token] = value.join(', ');
    const count = Object.hasOwn(meeting.attendanceCounts || {}, key) ? meeting.attendanceCounts[key] : value.length;
    flat[`${token} PRESENT`] = count == null ? '' : String(count);
  }
  const requests = Object.entries(flat).map(([key, value]) => ({ replaceAllText: {
    containsText: { text: `{{${key}}}`, matchCase: true }, replaceText: String(value ?? ''),
  } }));
  const topicText = meeting.topics.map((topic, index) => {
    const type = String(topic.type || '').replace('P', 'Presentation').replace('D', 'Discussion').replace('V', 'Voting').replaceAll('/', ' / ');
    return `${index + 1}. ${topic.title}\nType of Intervention - ${type}\nSpeaker - ${topic.speaker || ''}\n`;
  }).join('\n');
  requests.push({ replaceAllText: { containsText: { text: '{{TOPICS}}', matchCase: true }, replaceText: topicText } });
  return requests;
}

function documentText(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) documentText(item, output);
  } else if (value && typeof value === 'object') {
    if (typeof value.textRun?.content === 'string') output.push(value.textRun.content);
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'textRun') documentText(child, output);
    }
  }
  return output.join('');
}

function topicFormattingRequests(content, topics) {
  const runs = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (value.textRun && typeof value.textRun.content === 'string') {
      if (!Number.isInteger(value.startIndex)) throw new Error('Document text indices are unavailable.');
      runs.push({ start: value.startIndex, text: value.textRun.content });
    }
    for (const [key, child] of Object.entries(value)) if (key !== 'textRun') visit(child);
  }
  visit(content);
  let text = '';
  const indices = [];
  for (const run of runs) {
    text += run.text;
    for (let i = 0; i < run.text.length; i++) indices.push(run.start + i);
  }
  const requests = [];
  let cursor = 0;
  for (const [index, topic] of topics.entries()) {
    for (const needle of [`${index + 1}. ${topic.title}`, 'Type of Intervention -', 'Speaker -']) {
      const position = text.indexOf(needle, cursor);
      if (position < 0 || indices[position] == null || indices[position + needle.length - 1] == null) throw new Error('Topic formatting target is missing.');
      requests.push({ updateTextStyle: { textStyle: { bold: true }, fields: 'bold', range: { startIndex: indices[position], endIndex: indices[position + needle.length - 1] + 1 } } });
      cursor = position + needle.length;
    }
  }
  return requests;
}

async function createMinutesDocument({ drive, docs, folderId, templateId, meeting }) {
  const copied = await drive.files.copy({
    fileId: templateId,
    supportsAllDrives: true,
    requestBody: { parents: [folderId], name: `GM Minutes ${meeting.date}` },
    fields: 'id,webViewLink',
  });
  const id = copied.data?.id;
  if (!id) throw new Error('Google Drive did not return the created document identifier.');
  const url = copied.data.webViewLink || `https://docs.google.com/document/d/${id}/edit`;
  try {
    const requests = replacementRequests(meeting);
    const document = await docs.documents.get({ documentId: id });
    const text = documentText(document.data?.body?.content || []);
    const missing = requests
      .map((request) => request.replaceAllText.containsText.text)
      .filter((placeholder) => !text.includes(placeholder));
    if (missing.length) throw new Error('The copied template does not contain all expected placeholders.');
    const filled = await docs.documents.batchUpdate({ documentId: id, requestBody: { requests } });
    if (!Array.isArray(filled.data?.replies) || filled.data.replies.length !== requests.length || filled.data.replies.some(reply => !(reply.replaceAllText?.occurrencesChanged > 0))) {
      throw new Error('The copied template could not be fully populated.');
    }
    const updated = await docs.documents.get({ documentId: id });
    const formatting = topicFormattingRequests(updated.data?.body?.content || [], meeting.topics);
    if (formatting.length) await docs.documents.batchUpdate({ documentId: id, requestBody: { requests: formatting } });
    return { id, url, complete: true };
  } catch {
    const error = new Error('The document was copied, but filling it failed.');
    error.code = 'DOCUMENT_INCOMPLETE';
    error.document = { id, url, complete: false };
    throw error;
  }
}

module.exports = { createGoogleServices, createMinutesDocument, replacementRequests, documentText, topicFormattingRequests, loadCredentials };
