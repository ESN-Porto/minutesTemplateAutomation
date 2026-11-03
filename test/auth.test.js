const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeRequest, AuthorizationError, verifyUser, hasProjectAccess } = require('../api/_lib/auth');

test('identity and project checks use the verified token with Supabase HTTP endpoints', async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => requests.length === 1 ? { id: 'verified', email: 'v@example.org' } : true };
  };
  const user = await verifyUser('https://db.example/', 'anon', 'token', fakeFetch);
  assert.equal(user.id, 'verified');
  assert.equal(await hasProjectAccess('https://db.example/', 'anon', 'token', 'minutes', user.id, fakeFetch), true);
  assert.equal(requests[0].url, 'https://db.example/auth/v1/user');
  assert.equal(requests[1].url, 'https://db.example/rest/v1/rpc/has_project_access');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(requests[1].options.body), { check_project_slug: 'minutes', check_user_id: 'verified' });
});

const tokenRequest = (authorization) => ({ headers: { authorization } });

test('rejects missing and malformed bearer credentials', async () => {
  for (const req of [{ headers: {} }, tokenRequest('Basic abc'), tokenRequest('Bearer a b')]) {
    await assert.rejects(authorizeRequest(req, {}), { status: 401 });
  }
});

test('verifies token and current project access for every request', async () => {
  const calls = [];
  const deps = {
    env: { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon', SUPABASE_PROJECT_SLUG: 'minutes' },
    verifyUser: async (url, key, token) => { calls.push(['verify', token]); return { id: 'user-1', email: 'v@example.org' }; },
    hasProjectAccess: async (url, key, token, slug, userId) => { calls.push(['access', slug, userId]); return true; },
  };
  assert.deepEqual(await authorizeRequest(tokenRequest('Bearer valid-token'), deps), { id: 'user-1', email: 'v@example.org' });
  assert.deepEqual(calls, [['verify', 'valid-token'], ['access', 'minutes', 'user-1']]);
});

test('denies users without project access and fails closed when config is absent', async () => {
  const deps = {
    env: { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon', SUPABASE_PROJECT_SLUG: 'minutes' },
    verifyUser: async () => ({ id: 'student', email: null }),
    hasProjectAccess: async () => false,
  };
  await assert.rejects(authorizeRequest(tokenRequest('Bearer token'), deps), { status: 403 });
  await assert.rejects(authorizeRequest(tokenRequest('Bearer token'), { ...deps, env: {} }), { status: 503 });
});

test('maps auth and authorization outages to a safe 503', async () => {
  const deps = { env: { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon', SUPABASE_PROJECT_SLUG: 'minutes' }, verifyUser: async () => { throw new Error('secret'); } };
  await assert.rejects(authorizeRequest(tokenRequest('Bearer token'), deps), (error) => error instanceof AuthorizationError && error.status === 503 && !error.message.includes('secret'));
});

test('rejects a token that Supabase reports as invalid and fails closed on an access RPC error', async () => {
  const env = { SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'anon', SUPABASE_PROJECT_SLUG: 'minutes' };
  await assert.rejects(authorizeRequest(tokenRequest('Bearer fake.jwt.token'), {
    env, verifyUser: async () => { throw Object.assign(new Error('private'), { status: 401 }); },
  }), { status: 401 });
  await assert.rejects(authorizeRequest(tokenRequest('Bearer valid.jwt.token'), {
    env, verifyUser: async () => ({ id: 'user-1' }), hasProjectAccess: async () => { throw new Error('private'); },
  }), { status: 503 });
});
