'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertFinanceAccess, isSharedShoppingViewer } = require('../src/finance-api');

const shoppingViewer = { id: 2, profile: 'shopping_viewer' };

test('shopping-only profile can read only the shared shopping endpoint', () => {
  assert.doesNotThrow(() => assertFinanceAccess(shoppingViewer, { method: 'GET', path: '/api/finance/shopping' }, false));
  for (const ctx of [
    { method: 'GET', path: '/api/finance/dashboard' },
    { method: 'GET', path: '/api/finance/shopping/commit' },
    { method: 'PUT', path: '/api/finance/shopping' },
    { method: 'POST', path: '/api/finance/transactions' }
  ]) assert.throws(() => assertFinanceAccess(shoppingViewer, ctx, ctx.method !== 'GET'), /lista de compras compartilhada/);
});

test('shared shopping access is limited to the explicitly linked user ID', () => {
  const state = { sharedViewerIds: ['2'] };
  assert.equal(isSharedShoppingViewer(state, shoppingViewer), true);
  assert.equal(isSharedShoppingViewer(state, { id: 3, profile: 'shopping_viewer' }), false);
  assert.equal(isSharedShoppingViewer({ sharedViewerIds: [] }, shoppingViewer), false);
});

test('general viewer keeps read access and remains unable to write', () => {
  const viewer = { id: 4, profile: 'viewer' };
  assert.doesNotThrow(() => assertFinanceAccess(viewer, { method: 'GET', path: '/api/finance/dashboard' }, false));
  assert.throws(() => assertFinanceAccess(viewer, { method: 'POST', path: '/api/finance/transactions' }, true), /n.o pode alter/i);
});
