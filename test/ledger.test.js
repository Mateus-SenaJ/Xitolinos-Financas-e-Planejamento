'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLedger } = require('../src/domain/ledger');

test('transfers change account balances but are excluded from income and expenses', () => {
  const state = {
    accounts: [
      { id: 'checking', name: 'Conta', openingBalanceCents: 10000, isLiquid: true },
      { id: 'savings', name: 'Poupança', openingBalanceCents: 0, isLiquid: true }
    ],
    categories: [], budgets: [], goals: [],
    transactions: [
      { id: 'income-1', description: 'Pagamento', date: '2026-10-01', type: 'income', amountCents: 5000, accountId: 'checking' },
      { id: 'transfer-1', description: 'Reserva', date: '2026-10-01', type: 'transfer', amountCents: 3000, accountId: 'checking', counterpartyAccountId: 'savings' },
      { id: 'expense-1', description: 'Mercado', date: '2026-10-01', type: 'expense', amountCents: 1000, accountId: 'checking', category: 'Mercado' }
    ]
  };
  const ledger = calculateLedger(state, { key: '2026-10', start: '2026-10-01', end: '2026-10-01' });
  assert.equal(ledger.totals.incomeCents, 5000);
  assert.equal(ledger.totals.expenseCents, 1000);
  assert.equal(ledger.accounts.find(account => account.id === 'checking').balanceCents, 11000);
  assert.equal(ledger.accounts.find(account => account.id === 'savings').balanceCents, 3000);
  assert.equal(ledger.totals.netBalanceCents, 14000);
  assert.equal(ledger.totals.balanceExplanation.records.some(record => record.id === 'transfer-1'), false);
});
test('current month uses the local calendar date rather than the UTC date', () => {
  const { currentMonth } = require('../src/domain/ledger');
  const localDate = {
    getFullYear: () => 2026,
    getMonth: () => 9,
    getDate: () => 31,
    toISOString: () => '2026-11-01T02:00:00.000Z'
  };
  assert.deepEqual(currentMonth(() => localDate), {
    key: '2026-10', start: '2026-10-01', end: '2026-10-31'
  });
});
