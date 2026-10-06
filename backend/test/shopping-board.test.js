'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShoppingBoard, shoppingListTotalCents } = require('../src/shopping-board');

const baseList = () => ({
  id: 'list_12345678', month: '2026-10', kind: 'market', name: 'Mercado · out/2026', status: 'open',
  items: [{ id: 'item_12345678', name: 'Arroz', section: 'Mercearia', quantityMilli: 1500, unit: 'kg', estimatedCents: 800, paidCents: 750, status: 'purchased' }]
});

test('shopping state keeps money in cents and rounds purchased quantities once', () => {
  const list = baseList();
  const normalized = normalizeShoppingBoard({ lists: [list], stock: [] });
  assert.equal(normalized.lists[0].items[0].paidCents, 750);
  assert.equal(shoppingListTotalCents(normalized.lists[0]), 1125);
});

test('shopping board never accepts a client supplied financial transaction link', () => {
  const list = { ...baseList(), financialTransactionId: 88 };
  const normalized = normalizeShoppingBoard({ lists: [list], stock: [] });
  assert.equal(normalized.lists[0].financialTransactionId, null);
});

test('a financially recorded list cannot be edited or counted again through state updates', () => {
  const previous = { lists: [{ ...baseList(), financialTransactionId: 42 }], stock: [] };
  const unchanged = normalizeShoppingBoard(previous, previous);
  assert.equal(unchanged.lists[0].financialTransactionId, 42);
  const changed = structuredClone(previous);
  changed.lists[0].items[0].paidCents = 900;
  assert.throws(() => normalizeShoppingBoard(changed, previous), /já foi contabilizada/);
  assert.throws(() => normalizeShoppingBoard({ lists: [], stock: [] }, previous), /n\u00E3o pode ser removida/);
});

test('a completed shopping list cannot be edited, reopened or deleted from history', () => {
  const emptyCompletion = { ...baseList(), status: 'completed', items: [{ ...baseList().items[0], paidCents: 0, status: 'planned' }] };
  assert.throws(() => normalizeShoppingBoard({ lists: [emptyCompletion], stock: [] }), /valor pago para ser finalizada/);
  const unpurchasedCompletion = { ...baseList(), status: 'completed', items: [{ ...baseList().items[0], status: 'planned' }] };
  assert.throws(() => normalizeShoppingBoard({ lists: [unpurchasedCompletion], stock: [] }), /valor pago para ser finalizada/);
  const defaultQuantityCompletion = { ...baseList(), status: 'completed', items: [{ ...baseList().items[0], quantityMilli: undefined }] };
  const defaultQuantitySaved = normalizeShoppingBoard({ lists: [defaultQuantityCompletion], stock: [] });
  assert.equal(defaultQuantitySaved.lists[0].items[0].quantityMilli, 1000);
  assert.equal(shoppingListTotalCents(defaultQuantitySaved.lists[0]), 750);
  const saved = normalizeShoppingBoard({ lists: [{ ...baseList(), status: 'completed' }], stock: [] });
  const previous = structuredClone(saved);
  const changed = structuredClone(saved);
  changed.lists[0].items[0].paidCents = 900;
  assert.throws(() => normalizeShoppingBoard(changed, previous), /foi finalizada/);
  const reopened = structuredClone(saved);
  reopened.lists[0].status = 'open';
  assert.throws(() => normalizeShoppingBoard(reopened, previous), /foi finalizada/);
  assert.throws(() => normalizeShoppingBoard({ lists: [], stock: [] }, previous), /n\u00E3o pode ser removida/);
  const openList = normalizeShoppingBoard({ lists: [baseList()], stock: [] });
  assert.deepEqual(normalizeShoppingBoard({ lists: [], stock: [] }, openList).lists, []);
});

test('shopping board rejects invalid quantity, duplicate IDs and unsupported state values', () => {
  const invalidQuantity = baseList();
  invalidQuantity.items[0].quantityMilli = 0;
  assert.throws(() => normalizeShoppingBoard({ lists: [invalidQuantity], stock: [] }), /Quantidade inv/);

  const duplicateItems = baseList();
  duplicateItems.items.push({ ...duplicateItems.items[0] });
  assert.throws(() => normalizeShoppingBoard({ lists: [duplicateItems], stock: [] }), /identificadores repetidos/);

  const invalidState = baseList();
  invalidState.items[0].status = 'automatically-bought';
  assert.throws(() => normalizeShoppingBoard({ lists: [invalidState], stock: [] }), /Estado de item inv/);
});
