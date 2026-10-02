'use strict';

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestPolicyError(request, url, port) {
  const allowedHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
  const host = String(request.headers.host || '').toLowerCase();
  if (!allowedHosts.has(host)) {
    return { status: 403, code: 'UNTRUSTED_HOST', error: 'Acesso permitido somente por localhost.' };
  }

  if (!url.pathname.startsWith('/api/')) return null;

  const allowedOrigins = new Set(['http://127.0.0.1:' + port, 'http://localhost:' + port]);
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return { status: 403, code: 'UNTRUSTED_ORIGIN', error: 'Origem da requisição não permitida.' };
  }

  const method = String(request.method || 'GET').toUpperCase();
  if (!BODYLESS_METHODS.has(method)) {
    const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', error: 'A API aceita alterações somente em JSON.' };
    }
  }

  return null;
}

module.exports = { requestPolicyError };
