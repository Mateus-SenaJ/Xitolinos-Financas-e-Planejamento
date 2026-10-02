'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { SqliteStore } = require('./src/persistence/sqlite-store');
const { FinanceService } = require('./src/application/finance-service');
const { requestPolicyError } = require('./src/http/request-policy');

const ROOT = __dirname;
const DATA_DIR = process.env.SALDO_DATA_DIR ? path.resolve(process.env.SALDO_DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 8765;
const store = new SqliteStore(path.join(DATA_DIR, 'finance.sqlite'), path.join(DATA_DIR, 'store.json'));
const finance = new FinanceService(store);

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error('Corpo da requisição muito grande.'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  try { return JSON.parse(body || '{}'); } catch { throw Object.assign(new Error('JSON inválido.'), { status: 400, code: 'INVALID_JSON' }); }
}

async function handleApi(request, response, url) {
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const resource = segments[1];
  const id = segments[2];

  if (request.method === 'GET' && url.pathname === '/api/state') return sendJson(response, 200, finance.getState(url.searchParams.get('month') || undefined));
  if (request.method === 'GET' && url.pathname === '/api/trash') return sendJson(response, 200, { items: finance.getTrash() });
  if (request.method === 'GET' && url.pathname === '/api/audit') {
    const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limit')) || 100));
    return sendJson(response, 200, { events: finance.getAudit(limit) });
  }

  if (resource === 'accounts' && request.method === 'POST' && segments.length === 2) {
    return sendJson(response, 201, finance.createAccount(await readBody(request)));
  }
  if (resource === 'accounts' && request.method === 'PATCH' && id) {
    return sendJson(response, 200, finance.updateAccount(id, await readBody(request)));
  }
  if (resource === 'categories' && request.method === 'POST' && segments.length === 2) {
    return sendJson(response, 201, finance.createCategory(await readBody(request)));
  }
  if (resource === 'categories' && request.method === 'POST' && id && segments[3] === 'archive') {
    return sendJson(response, 200, finance.archiveCategory(id));
  }
  if (resource === 'categories' && request.method === 'PATCH' && id) {
    const body = await readBody(request);
    return sendJson(response, 200, finance.updateCategoryStatus(id, body.status));
  }
  if (resource === 'establishments' && request.method === 'POST' && segments.length === 2) {
    return sendJson(response, 201, finance.createEstablishment(await readBody(request)));
  }
  if (resource === 'establishments' && request.method === 'PATCH' && id) {
    return sendJson(response, 200, finance.updateEstablishment(id, await readBody(request)));
  }

  if (resource === 'transactions') {
    if (request.method === 'POST' && segments.length === 2) {
      const transaction = finance.createTransaction(await readBody(request));
      return sendJson(response, 201, transaction);
    }
    if (request.method === 'POST' && id && segments[3] === 'restore') return sendJson(response, 200, finance.restoreTransaction(id));
    if (request.method === 'DELETE' && id) return sendJson(response, 200, finance.deleteTransaction(id));
  }

  if (resource === 'goals') {
    if (request.method === 'POST' && segments.length === 2) return sendJson(response, 201, finance.createGoal(await readBody(request)));
    if (request.method === 'PATCH' && id) return sendJson(response, 200, finance.updateGoal(id, await readBody(request)));
    if (request.method === 'DELETE' && id) return sendJson(response, 200, finance.deleteGoal(id));
  }

  if (resource === 'budgets' && request.method === 'PATCH' && id) {
    return sendJson(response, 200, finance.updateBudget(id, await readBody(request)));
  }

  return sendJson(response, 404, { error: 'Rota não encontrada.', code: 'NOT_FOUND' });
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const policyError = requestPolicyError(request, url, PORT);
    if (policyError) return sendJson(response, policyError.status, { error: policyError.error, code: policyError.code });
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Método não permitido.', code: 'METHOD_NOT_ALLOWED' });
    if (url.pathname !== '/' && url.pathname !== '/index.html') return sendJson(response, 404, { error: 'Arquivo não encontrado.', code: 'NOT_FOUND' });
    const html = await fs.readFile(path.join(ROOT, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'" });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch (error) {
    const status = error.status || 500;
    sendJson(response, status, { error: status < 500 ? error.message : 'Erro interno. Tente novamente.', code: error.code || 'INTERNAL_ERROR' });
  }
}

const server = http.createServer(handleRequest);
server.listen(PORT, '127.0.0.1', () => console.log(`Saldo rodando em http://127.0.0.1:${PORT}`));
server.on('close', () => store.close());