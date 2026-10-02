'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FinanceService, isCivilDate } = require('../src/application/finance-service');

function memoryStore() {
  let state = {
    accounts: [{ id: 'cash', name: 'Carteira', openingBalanceCents: 0, isLiquid: true, type: 'cash', status: 'active' }],
    categories: [{ id: 'home', name: 'Casa', type: 'expense' }, { id: 'salary', name: 'Salário', type: 'income' }, { id: 'transfer', name: 'Transferência', type: 'transfer' }],
    transactions: [], budgets: [{ category: 'Casa', limitCents: 10000 }], goals: []
  };
  const audit = [];
  return {
    loadState: () => structuredClone(state),
    saveState: (next, event) => { state = structuredClone(next); if (event) audit.unshift(event); },
    loadAudit: () => structuredClone(audit)
  };
}

test('transaction service accepts integer cents and persists the record', () => {
  const store = memoryStore();
  const service = new FinanceService(store, () => new Date('2026-10-01T12:00:00.000Z'));
  const created = service.createTransaction({ description: 'Mercado', category: 'Casa', date: '2026-10-01', type: 'expense', amountCents: 1250, accountId: 'cash' });
  assert.equal(created.amountCents, 1250);
  assert.equal(service.getState().transactions[0].id, created.id);
});

test('transaction service rejects decimal money and invalid civil dates', () => {
  const service = new FinanceService(memoryStore());
  assert.throws(() => service.createTransaction({ description: 'Teste', category: 'Casa', date: '2026-02-30', type: 'expense', amountCents: 100, accountId: 'cash' }), error => error.status === 400);
  assert.throws(() => service.createTransaction({ description: 'Teste', category: 'Casa', date: '2026-10-01', type: 'expense', amountCents: 1.5, accountId: 'cash' }), error => error.status === 400);
  assert.equal(isCivilDate('2024-02-29'), true);
  assert.equal(isCivilDate('2025-02-29'), false);
});

test('goal and budget updates retain cent precision', () => {
  const store = memoryStore();
  const service = new FinanceService(store);
  const goal = service.createGoal({ name: 'Reserva', targetCents: 10001, savedCents: 500 });
  assert.equal(service.updateGoal(goal.id, { savedCents: 750 }).savedCents, 750);
  assert.equal(service.updateBudget('Casa', { limitCents: 20025 }).limitCents, 20025);
});

test('internal transfer requires distinct owned accounts', () => {
  const store = memoryStore();
  const service = new FinanceService(store);
  store.saveState({ ...store.loadState(), accounts: [...store.loadState().accounts, { id: 'bank', name: 'Banco', openingBalanceCents: 0, isLiquid: true, type: 'checking', status: 'active' }] });
  const transfer = service.createTransaction({ description: 'Entre contas', category: 'Transferência', date: '2026-10-01', type: 'transfer', amountCents: 500, accountId: 'cash', counterpartyAccountId: 'bank' });
  assert.equal(transfer.type, 'transfer');
  assert.throws(() => service.createTransaction({ description: 'Inválida', date: '2026-10-01', type: 'transfer', amountCents: 500, accountId: 'cash', counterpartyAccountId: 'cash' }), error => error.status === 400);
});

test('account updates are audited and archived accounts cannot receive new entries', () => {
  const store = memoryStore();
  const service = new FinanceService(store, () => new Date('2026-10-01T12:00:00.000Z'));
  service.updateAccount('cash', { name: 'Carteira principal', notes: 'Uso diário' });
  assert.equal(service.getAudit().some(event => event.entityId === 'cash' && event.action === 'update'), true);
  service.updateAccount('cash', { status: 'archived' });
  assert.throws(() => service.createTransaction({ description: 'Despesa', category: 'Casa', date: '2026-10-01', type: 'expense', amountCents: 100, accountId: 'cash' }), error => error.status === 400);
});

test('archived categories are preserved but unavailable for new transactions', () => {
  const store = memoryStore();
  const service = new FinanceService(store);
  const categoryState = store.loadState();
  categoryState.categories.push({ id: 'food', name: 'Restaurante', type: 'expense', parentId: null, status: 'active' });
  store.saveState(categoryState);
  service.archiveCategory('food');
  assert.equal(service.getState().categories.some(item => item.id === 'food' && item.status === 'archived'), true);
  assert.throws(() => service.createTransaction({ description: 'Jantar', category: 'Restaurante', date: '2026-10-01', type: 'expense', amountCents: 100, accountId: 'cash' }), error => error.status === 400);
});
test('archived establishments cannot be selected for new transactions', () => {
  const store = memoryStore();
  const state = store.loadState();
  state.establishments = [{ id: 'old-shop', name: 'Loja antiga', status: 'archived', aliases: [] }];
  store.saveState(state);
  const service = new FinanceService(store);
  assert.throws(() => service.createTransaction({ description: 'Compra', category: 'Casa', date: '2026-10-01', type: 'expense', amountCents: 500, accountId: 'cash', establishmentId: 'old-shop' }), error => error.status === 400);
});

test('status updates cannot archive a category before its active subcategories', () => {
  const store = memoryStore();
  const service = new FinanceService(store);
  const state = store.loadState();
  state.categories[0].status = 'active';
  state.categories.push({ id: 'room', name: 'Quarto', type: 'expense', parentId: 'home', status: 'active' });
  store.saveState(state);
  assert.throws(() => service.updateCategoryStatus('home', 'archived'), error => error.status === 400);
  service.updateCategoryStatus('room', 'archived');
  assert.doesNotThrow(() => service.updateCategoryStatus('home', 'archived'));
});
