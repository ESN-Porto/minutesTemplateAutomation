const { authorizeRequest } = require('./_lib/auth');
const { listMeetings } = require('./_lib/agenda');
const { createGoogleServices } = require('./_lib/google');
const { jsonResponse, requireMethod, safeErrorResponse } = require('./_lib/http');

function createHandler(deps = {}) {
  return async function meetings(req, res) {
    if (!requireMethod(req, res, 'GET')) return;
    try {
      const actor = await (deps.authorize || authorizeRequest)(req, deps.authDeps);
      const services = await (deps.getServices || createGoogleServices)(deps.env || process.env);
      const meetings = await (deps.listMeetings || listMeetings)(services.sheets, services.config.spreadsheetId);
      (deps.logger || console).info('Protected operation', { actorId: actor.id, operation: 'list_meetings', outcome: 'success' });
      return jsonResponse(res, 200, { meetings });
    } catch (error) {
      (deps.logger || console).info('Protected operation', { operation: 'list_meetings', outcome: 'failure', code: error?.code || 'REQUEST_FAILED' });
      return safeErrorResponse(res, error, deps.logger || console);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
