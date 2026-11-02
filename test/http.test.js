const test = require('node:test');
const assert = require('node:assert/strict');
const { jsonResponse, requireMethod } = require('../api/_lib/http');

function responseStub() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('jsonResponse sends JSON with a no-store cache policy', () => {
  const res = responseStub();
  jsonResponse(res, 200, { ok: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(res.body, { ok: true });
});

test('requireMethod sends a 405 response for unsupported methods', () => {
  const res = responseStub();
  const allowed = requireMethod({ method: 'POST' }, res, 'GET');
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method not allowed.' });
});

test('safeErrorResponse does not expose internal error details', () => {
  const { safeErrorResponse } = require('../api/_lib/http');
  const res = responseStub();
  safeErrorResponse(res, new Error('private token: abc123'));
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'The request could not be completed.' });
});
