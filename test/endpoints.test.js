const test = require('node:test');
const assert = require('node:assert/strict');
const meetingsModule = require('../api/meetings');
const generateModule = require('../api/generate');
const sessionModule = require('../api/session');

function resStub() {
  return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
}
const logger = { info() {}, error() {} };

test('session checks project access without initializing Google services', async () => {
  const res = resStub();
  await sessionModule.createHandler({ logger, authorize: async () => ({ id: 'actor' }) })({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { authorized: true });
});

test('session denies unauthorized users', async () => {
  const res = resStub();
  await sessionModule.createHandler({ logger, authorize: async () => { throw Object.assign(new Error('denied'), { status: 403 }); } })({ method: 'GET' }, res);
  assert.equal(res.statusCode, 403);
});

test('protected handlers reject unsupported methods', async () => {
  const meetings = meetingsModule.createHandler();
  const generate = generateModule.createHandler();
  const getRes = resStub(); const postRes = resStub();
  await meetings({ method: 'POST' }, getRes);
  await generate({ method: 'GET' }, postRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(postRes.statusCode, 405);
});

test('meeting list authenticates before listing', async () => {
  let listed = false;
  const handler = meetingsModule.createHandler({
    logger, authorize: async () => { throw Object.assign(new Error('denied'), { status: 403 }); },
    getServices: () => { throw new Error('must not run'); },
    listMeetings: async () => { listed = true; return []; },
  });
  const res = resStub();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(listed, false);
});

test('generation validates and reads agenda before creating any document', async () => {
  let created = false;
  const handler = generateModule.createHandler({
    logger, authorize: async () => ({ id: 'actor' }),
    getServices: async () => ({ sheets: {}, drive: {}, docs: {}, config: { spreadsheetId: 'source', folderId: 'folder', templateId: 'template' } }),
    readMeeting: async () => { throw new Error('missing required agenda data'); },
    createDocument: async () => { created = true; },
  });
  const res = resStub();
  await handler({ method: 'POST', body: { date: '02/11/2026' } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(created, false);
});

test('generation rejects an invalid date before creating a document', async () => {
  let created = false;
  const handler = generateModule.createHandler({
    logger, authorize: async () => ({ id: 'actor' }),
    getServices: async () => ({ sheets: {}, config: { spreadsheetId: 'source' } }),
    createDocument: async () => { created = true; },
  });
  const res = resStub();
  await handler({ method: 'POST', body: { date: '31/02/2026' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(created, false);
});

test('generation returns success only after document adapter completes', async () => {
  const handler = generateModule.createHandler({
    logger, authorize: async () => ({ id: 'actor' }),
    getServices: async () => ({ sheets: {}, drive: {}, docs: {}, config: { spreadsheetId: 'source', folderId: 'folder', templateId: 'template' } }),
    readMeeting: async () => ({ date: '02/11/2026', start: '18:00', end: '20:00', attendees: [], chairingTeam: {}, nextChairingTeam: {}, topics: [] }),
    createDocument: async () => ({ id: 'doc', url: 'https://docs.google.com/document/d/doc/edit', complete: true }),
  });
  const res = resStub();
  await handler({ method: 'POST', body: { date: '02/11/2026' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
});

test('generation reports the copied document separately when a post-copy write fails', async () => {
  const handler = generateModule.createHandler({
    logger, authorize: async () => ({ id: 'actor' }),
    getServices: async () => ({ sheets: {}, drive: {}, docs: {}, config: { spreadsheetId: 'source', folderId: 'folder', templateId: 'template' } }),
    readMeeting: async () => ({ date: '02/11/2026', start: '18:00', end: '20:00', attendees: [], chairingTeam: {}, nextChairingTeam: {}, topics: [] }),
    createDocument: async () => { throw Object.assign(new Error('safe'), { code: 'DOCUMENT_INCOMPLETE', document: { id: 'partial-doc', url: 'https://docs.google.com/document/d/partial-doc/edit', complete: false } }); },
  });
  const res = resStub();
  await handler({ method: 'POST', body: { date: '02/11/2026' } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body.recovery, { id: 'partial-doc', url: 'https://docs.google.com/document/d/partial-doc/edit', complete: false });
  assert.equal(res.body.complete, undefined);
});
