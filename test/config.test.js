const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../api/config');

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
}

test('public config exposes only Supabase URL and anon key', () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY, secret: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = 'https://auth.example';
  process.env.SUPABASE_ANON_KEY = 'public-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-secret';
  try {
    const res = response();
    config({ method: 'GET' }, res);
    assert.deepEqual(res.body, { url: 'https://auth.example', anonKey: 'public-anon' });
    assert.equal(JSON.stringify(res.body).includes('private-secret'), false);
    assert.equal(res.headers['cache-control'], 'no-store');
  } finally {
    for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_ANON_KEY', saved.key], ['SUPABASE_SERVICE_ROLE_KEY', saved.secret]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
