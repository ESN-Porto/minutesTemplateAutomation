const { authorizeRequest } = require('./_lib/auth');
const { jsonResponse, requireMethod, safeErrorResponse } = require('./_lib/http');

function createHandler(deps = {}) {
  return async function session(req, res) {
    if (!requireMethod(req, res, 'GET')) return;
    try {
      await (deps.authorize || authorizeRequest)(req, deps.authDeps);
      return jsonResponse(res, 200, { authorized: true });
    } catch (error) {
      return safeErrorResponse(res, error, deps.logger || console);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
