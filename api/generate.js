const { authorizeRequest } = require('./_lib/auth');
const { readMeeting } = require('./_lib/agenda');
const { createGoogleServices, createMinutesDocument } = require('./_lib/google');
const { jsonResponse, requireMethod, safeErrorResponse } = require('./_lib/http');

function createHandler(deps = {}) {
  return async function generate(req, res) {
    if (!requireMethod(req, res, 'POST')) return;
    let actor;
    try {
      actor = await (deps.authorize || authorizeRequest)(req, deps.authDeps);
      const date = req.body?.date;
      const services = await (deps.getServices || createGoogleServices)(deps.env || process.env);
      const meeting = await (deps.readMeeting || readMeeting)(services.sheets, services.config.spreadsheetId, date);
      const result = await (deps.createDocument || createMinutesDocument)({
        drive: services.drive, docs: services.docs, folderId: services.config.folderId,
        templateId: services.config.templateId, meeting,
      });
      (deps.logger || console).info('Protected operation', { actorId: actor.id, operation: 'generate_minutes', outcome: 'success' });
      return jsonResponse(res, 200, { ...result, warnings: meeting.warnings || [] });
    } catch (error) {
      (deps.logger || console).info('Protected operation', { actorId: actor?.id, operation: 'generate_minutes', outcome: 'failure', code: error?.code || 'REQUEST_FAILED' });
      return safeErrorResponse(res, error, deps.logger || console);
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
