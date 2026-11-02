function jsonResponse(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader('Allow', method);
  jsonResponse(res, 405, { error: 'Method not allowed.' });
  return false;
}

function safeErrorResponse(res, error, logger = console) {
  logger.error('Request failed', { name: error?.name || 'Error' });
  return jsonResponse(res, 500, { error: 'The request could not be completed.' });
}

module.exports = { jsonResponse, requireMethod, safeErrorResponse };
