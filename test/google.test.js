const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleServices, createMinutesDocument, replacementRequests, loadCredentials, topicFormattingRequests } = require('../api/_lib/google');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('requires all server-only Google configuration', () => {
  assert.throws(() => createGoogleServices({}), { code: 'GOOGLE_CONFIG_MISSING' });
});

test('listing dates does not require a template or destination folder', async () => {
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'test@example.org', private_key: 'test' }), GOOGLE_SPREADSHEET_ID: 'source' };
  const services = createGoogleServices(env, { tokenProvider: async () => 'token', fetchFn: async () => ({ ok: true, json: async () => ({ sheets: [] }) }) });
  assert.deepEqual((await services.sheets.spreadsheets.get({ spreadsheetId: 'source', fields: 'sheets.properties.title' })).data, { sheets: [] });
});

test('a server JSON credential takes precedence over a local file path', () => {
  const json = JSON.stringify({ client_email: 'test@example.org', private_key: 'test' });
  assert.equal(loadCredentials({ GOOGLE_SERVICE_ACCOUNT_JSON: json, GOOGLE_SERVICE_ACCOUNT_FILE: '/unavailable/local/file' }).client_email, 'test@example.org');
});

test('document creation rejects missing destination before copying', async () => {
  let copied = false;
  await assert.rejects(createMinutesDocument({ drive: { files: { copy: async () => { copied = true; } } }, docs: {}, templateId: 'template', meeting: {} }), { code: 'GOOGLE_CONFIG_MISSING' });
  assert.equal(copied, false);
});

test('loads a local service-account JSON file without requiring credentials in source or chat', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minutes-sa-'));
  const filename = path.join(dir, 'service-account.json');
  try {
    fs.writeFileSync(filename, JSON.stringify({ client_email: 'minutes@example.iam.gserviceaccount.com', private_key: 'test-only' }));
    assert.deepEqual(loadCredentials({ GOOGLE_SERVICE_ACCOUNT_FILE: filename }), {
      client_email: 'minutes@example.iam.gserviceaccount.com', private_key: 'test-only',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Google clients call Sheets and Shared Drive endpoints with server credentials', async () => {
  const requests = [];
  const env = { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'test@example.org', private_key: 'test' }), GOOGLE_SPREADSHEET_ID: 'source', GOOGLE_TEMPLATE_ID: 'template', GOOGLE_DESTINATION_FOLDER_ID: 'folder' };
  const services = createGoogleServices(env, {
    tokenProvider: async () => 'test-token',
    fetchFn: async (url, options) => { requests.push({ url: String(url), options }); return { ok: true, status: 200, json: async () => ({ id: 'result' }) }; },
  });
  await services.sheets.spreadsheets.values.batchGet({ spreadsheetId: 'source', ranges: ["'26/10/2026'!P1:AR66"] });
  await services.drive.files.copy({ fileId: 'template', supportsAllDrives: true, requestBody: { parents: ['folder'] }, fields: 'id,webViewLink' });
  assert.match(requests[0].url, /sheets\.googleapis\.com\/v4\/spreadsheets\/source\/values:batchGet/);
  assert.equal(new URL(requests[0].url).searchParams.get('ranges'), "'26/10/2026'!P1:AR66");
  assert.equal(new URL(requests[1].url).searchParams.get('supportsAllDrives'), 'true');
  assert.deepEqual(JSON.parse(requests[1].options.body).parents, ['folder']);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-token');
});

test('copies into the configured folder with Shared Drive support and fills the copy', async () => {
  const calls = [];
  const drive = { files: { copy: async (args) => { calls.push(['copy', args]); return { data: { id: 'doc-1', webViewLink: 'https://docs.google.com/document/d/doc-1/edit' } }; } } };
  let reads = 0;
  const docs = { documents: {
    get: async () => ({ data: { body: { content: ++reads === 1 ? [{ paragraph: { elements: [{ textRun: { content: replacementRequests(meeting).map((r) => r.replaceAllText.containsText.text).join(' ') } }] } }] : [
      { paragraph: { elements: [{ startIndex: 10, textRun: { content: '1. Topic\n' } }] } },
      { paragraph: { elements: [{ startIndex: 19, textRun: { content: 'Type of Intervention - Discussion\n' } }] } },
      { paragraph: { elements: [{ startIndex: 51, textRun: { content: 'Speaker - A\n' } }] } },
    ] } } }),
    batchUpdate: async (args) => { calls.push(['write', args]); return { data: { replies: args.requestBody.requests.map(() => ({ replaceAllText: { occurrencesChanged: 1 } })) } }; },
  } };
  const meeting = { date: '02/11/2026', start: '18:00', end: '20:00', chairingTeam: {}, nextChairingTeam: {}, attendeesByCategory: {}, topics: [{ title: 'Topic', type: 'D', speaker: 'A' }] };
  const result = await createMinutesDocument({ drive, docs, folderId: 'folder', templateId: 'template', meeting });
  assert.equal(result.complete, true);
  assert.deepEqual(calls[0][1].requestBody.parents, ['folder']);
  assert.equal(calls[0][1].supportsAllDrives, true);
  assert.equal(calls[1][1].documentId, 'doc-1');
  assert.equal(calls[2][1].requestBody.requests.length, 3);
});

test('formats topic titles and labels using document indices', () => {
  const body = [
    { paragraph: { elements: [{ startIndex: 10, textRun: { content: '1. Topic\n' } }] } },
    { paragraph: { elements: [{ startIndex: 19, textRun: { content: 'Type of Intervention - Discussion\n' } }] } },
    { paragraph: { elements: [{ startIndex: 52, textRun: { content: 'Speaker - A\n' } }] } },
  ];
  const requests = topicFormattingRequests(body, [{ title: 'Topic' }]);
  assert.deepEqual(requests.map(r => r.updateTextStyle.range), [{ startIndex: 10, endIndex: 18 }, { startIndex: 19, endIndex: 41 }, { startIndex: 52, endIndex: 61 }]);
});

test('returns the recovery identifier when filling a copied document fails', async () => {
  const drive = { files: { copy: async () => ({ data: { id: 'partial-1' } }) } };
  const docs = { documents: { batchUpdate: async () => { throw new Error('private detail'); } } };
  await assert.rejects(createMinutesDocument({ drive, docs, folderId: 'folder', templateId: 'template', meeting: {
    date: '02/11/2026', chairingTeam: {}, nextChairingTeam: {}, attendeesByCategory: {}, topics: [],
  } }), (error) => error.code === 'DOCUMENT_INCOMPLETE' && error.document.id === 'partial-1' && error.document.complete === false && !error.message.includes('private detail'));
});

test('does not report success when the copied template has no expected placeholder', async () => {
  let wrote = false;
  const drive = { files: { copy: async () => ({ data: { id: 'wrong-template' } }) } };
  const docs = { documents: {
    get: async () => ({ data: { body: { content: [] } } }),
    batchUpdate: async () => { wrote = true; },
  } };
  await assert.rejects(createMinutesDocument({ drive, docs, folderId: 'folder', templateId: 'template', meeting: {
    date: '02/11/2026', chairingTeam: {}, nextChairingTeam: {}, attendeesByCategory: {}, topics: [],
  } }), (error) => error.code === 'DOCUMENT_INCOMPLETE' && error.document.id === 'wrong-template');
  assert.equal(wrote, false);
});

test('returns a recovery document when replacement reports a missing occurrence', async () => {
  const meeting = { date: '02/11/2026', chairingTeam: {}, nextChairingTeam: {}, attendeesByCategory: {}, topics: [] };
  const drive = { files: { copy: async () => ({ data: { id: 'partial-replacement' } }) } };
  const docs = { documents: {
    get: async () => ({ data: { body: { content: [{ paragraph: { elements: [{ textRun: { content: replacementRequests(meeting).map(r => r.replaceAllText.containsText.text).join(' ') } }] } }] } } }),
    batchUpdate: async ({ requestBody }) => ({ data: { replies: requestBody.requests.map(() => ({ replaceAllText: { occurrencesChanged: 0 } })) } }),
  } };
  await assert.rejects(createMinutesDocument({ drive, docs, folderId: 'folder', templateId: 'template', meeting }), error => error.code === 'DOCUMENT_INCOMPLETE' && error.document.id === 'partial-replacement');
});
