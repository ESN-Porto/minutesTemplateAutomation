class AuthorizationError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
    this.safeToExpose = true;
  }
}

function getBearerToken(req) {
  const value = req?.headers?.authorization || req?.headers?.Authorization;
  const match = typeof value === 'string' && value.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  if (!match) throw new AuthorizationError(401, 'Sign in to continue.');
  return match[1];
}

function configuration(env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectSlug = env.SUPABASE_PROJECT_SLUG;
  if (!url || !anonKey) {
    throw new AuthorizationError(503, 'Authentication is not configured for this environment.');
  }
  if (!projectSlug) {
    throw new AuthorizationError(503, 'Project access is not configured yet.');
  }
  return { url, anonKey, projectSlug };
}

async function verifyUser(url, anonKey, token, fetchFn = fetch) {
  const response = await fetchFn(`${url.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const failure = new Error('Identity verification failed.');
    failure.status = response.status;
    throw failure;
  }
  const user = await response.json();
  if (!user?.id) throw new Error('Identity verification failed.');
  return { id: user.id, email: user.email || null };
}

async function hasProjectAccess(url, anonKey, token, projectSlug, userId, fetchFn = fetch) {
  const response = await fetchFn(`${url.replace(/\/+$/, '')}/rest/v1/rpc/has_project_access`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ check_project_slug: projectSlug, check_user_id: userId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('Project access could not be verified.');
  return (await response.json()) === true;
}

async function authorizeRequest(req, deps = {}) {
  const token = getBearerToken(req);
  let config;
  try {
    config = configuration(deps.env || process.env);
  } catch (error) {
    throw error;
  }
  const verify = deps.verifyUser || verifyUser;
  const checkAccess = deps.hasProjectAccess || hasProjectAccess;
  let user;
  try {
    user = await verify(config.url, config.anonKey, token);
  } catch (error) {
    if (Number.isInteger(error?.status) && error.status < 500 && error.status !== 429) {
      throw new AuthorizationError(401, 'Your session is invalid or has expired. Sign in again.');
    }
    throw new AuthorizationError(503, 'Authentication could not be verified. Try again later.');
  }
  let allowed;
  try {
    allowed = await checkAccess(config.url, config.anonKey, token, config.projectSlug, user.id);
  } catch {
    throw new AuthorizationError(503, 'Access could not be verified. Try again later.');
  }
  if (!allowed) throw new AuthorizationError(403, 'Your account does not have access to this project.');
  return { id: user.id, email: user.email || null };
}

module.exports = { authorizeRequest, AuthorizationError, getBearerToken, verifyUser, hasProjectAccess };
