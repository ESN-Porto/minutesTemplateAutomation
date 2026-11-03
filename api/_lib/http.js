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
  const status = Number.isInteger(error?.status) ? error.status : 500;
  logger.error('Request failed', { name: error?.name || 'Error', code: error?.code || 'UNEXPECTED' });
  if (error?.code === 'DOCUMENT_INCOMPLETE') {
    return jsonResponse(res, 502, { error: 'The document was created but could not be filled.', recovery: error.document });
  }
  return jsonResponse(res, status, { error: error?.safeToExpose ? error.message : 'The request could not be completed.' });
}

module.exports = { jsonResponse, requireMethod, safeErrorResponse };
