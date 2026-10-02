'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SqliteStore } = require('../src/persistence/sqlite-store');
const { FinanceService } = require('../src/application/finance-service');

test('migrates legacy JSON amounts to integer cents and persists state', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saldo-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacyFile = path.join(directory, 'store.json');
  const databaseFile = path.join(directory, 'db', 'finance.sqlite');
  fs.writeFileSync(legacyFile, JSON.stringify({
    transactions: [{ id: 'old-1', description: 'Conta', category: 'Casa', date: '2026-10-01', type: 'expense', amount: 10.25 }],
    budgets: [{ category: 'Casa', limit: 99.99 }],
    goals: [{ id: 'old-goal', name: 'Reserva', saved: 25.5, target: 100, symbol: '◎' }]
  }));

  const store = new SqliteStore(databaseFile, legacyFile);
  assert.equal(store.loadState().transactions[0].amountCents, 1025);
  assert.equal(store.loadState().budgets[0].limitCents, 9999);
  assert.equal(store.loadState().goals[0].savedCents, 2550);
  store.saveState({ transactions: [], budgets: [], goals: [] });
  store.close();

  const reopened = new SqliteStore(databaseFile, legacyFile);
  const emptyState = reopened.loadState();
  assert.deepEqual(emptyState.transactions, []);
  assert.deepEqual(emptyState.budgets, []);
  assert.deepEqual(emptyState.goals, []);
  assert.equal(emptyState.accounts.length, 1);
  assert.ok(emptyState.categories.length > 0);
  reopened.close();
});

test('persists transfers, keeps deleted transactions in trash, and audits restoration', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saldo-phase-one-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SqliteStore(path.join(directory, 'finance.sqlite'));
  const clock = () => new Date('2026-10-01T12:00:00.000Z');
  const service = new FinanceService(store, clock);
  const destination = service.createAccount({ name: 'Conta secundária', type: 'savings', openingBalanceCents: 20000 });
  const transfer = service.createTransaction({
    description: 'Separar reserva', category: 'Transferência', date: '2026-10-01',
    type: 'transfer', amountCents: 2500, accountId: 'account-main', counterpartyAccountId: destination.id
  });

  assert.equal(service.getState('2026-10').transactions.find(item => item.id === transfer.id).type, 'transfer');
  service.deleteTransaction(transfer.id);
  assert.equal(service.getState('2026-10').transactions.some(item => item.id === transfer.id), false);
  assert.equal(service.getTrash().some(item => item.id === transfer.id), true);

  service.updateAccount(destination.id, { notes: 'Reserva de curto prazo' });
  assert.equal(service.getTrash().some(item => item.id === transfer.id), true);
  service.restoreTransaction(transfer.id);
  assert.equal(service.getState('2026-10').transactions.some(item => item.id === transfer.id), true);
  assert.deepEqual(service.getAudit().filter(event => event.entityId === transfer.id).map(event => event.action), ['restore', 'soft_delete', 'create']);
  store.close();
});

test('persists establishments and normalized aliases', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saldo-merchants-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SqliteStore(path.join(directory, 'finance.sqlite'));
  const service = new FinanceService(store);
  const establishment = service.createEstablishment({ name: 'Café São José', aliases: ['Cafe Sao Jose', 'SAO JOSE CAFÉ'], defaultCategory: 'Alimentação', tags: ['café'] });
  assert.ok(store.loadState().establishments.some(item => item.id === establishment.id && item.aliases.length === 1));
  assert.throws(() => service.createEstablishment({ name: 'Outro', aliases: ['cafe sao jose'] }), error => error.status === 400);
  assert.throws(() => service.createEstablishment({ name: 'Cafe Sao Jose' }), error => error.status === 400);
  service.createEstablishment({ name: 'Padaria Central' });
  assert.throws(() => service.updateEstablishment(establishment.id, { name: 'PADARIA CENTRAL' }), error => error.status === 400);
  store.close();
});

test('persists a subcategory after its parent while retaining the parent reference', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saldo-subcategories-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new SqliteStore(path.join(directory, 'finance.sqlite'));
  const service = new FinanceService(store);
  const parent = store.loadState().categories.find(item => item.name === 'Moradia');
  const child = service.createCategory({ name: 'Condomínio', type: 'expense', parentId: parent.id });
  const loaded = store.loadState().categories.find(item => item.id === child.id);
  assert.equal(loaded.parentId, parent.id);
  store.close();
});