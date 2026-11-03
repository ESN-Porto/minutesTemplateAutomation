const { jsonResponse, requireMethod } = require('./_lib/http');

module.exports = function publicConfig(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return jsonResponse(res, 503, { error: 'Sign-in is not configured.' });
  return jsonResponse(res, 200, { url, anonKey });
};
