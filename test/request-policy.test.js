'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestPolicyError } = require('../src/http/request-policy');

const port = 8765;
const url = new URL('http://127.0.0.1:8765/api/transactions');

function request(overrides = {}) {
  return {
    method: overrides.method || 'POST',
    headers: { host: '127.0.0.1:8765', origin: 'http://127.0.0.1:8765', 'content-type': 'application/json', ...(overrides.headers || {}) }
  };
}

test('allows same-origin JSON mutations and local clients without an Origin header', () => {
  assert.equal(requestPolicyError(request(), url, port), null);
  assert.equal(requestPolicyError(request({ headers: { origin: undefined } }), url, port), null);
});

test('rejects API requests from an untrusted Origin', () => {
  const result = requestPolicyError(request({ headers: { origin: 'https://evil.example' } }), url, port);
  assert.equal(result.code, 'UNTRUSTED_ORIGIN');
  assert.equal(result.status, 403);
});

test('rejects unexpected Host headers', () => {
  const result = requestPolicyError(request({ headers: { host: 'evil.example:8765' } }), url, port);
  assert.equal(result.code, 'UNTRUSTED_HOST');
  assert.equal(result.status, 403);
});

test('rejects non-JSON mutation bodies', () => {
  const result = requestPolicyError(request({ headers: { 'content-type': 'text/plain' } }), url, port);
  assert.equal(result.code, 'UNSUPPORTED_MEDIA_TYPE');
  assert.equal(result.status, 415);
});

test('allows bodyless API reads without a Content-Type', () => {
  assert.equal(requestPolicyError(request({ method: 'GET', headers: { 'content-type': undefined } }), url, port), null);
});
