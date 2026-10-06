'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { installments, recurringOccurrences, normalizeMerchant, classifyImportedRows, totalsForMonth, shiftMonth } = require('../src/finance-engine');
const { getStatusBeforeDelete, getRestoredTransactionStatus, auditTransaction } = require('../src/finance-api');

test('divide parcelamento em centavos sem perder valor', () => {
  assert.deepEqual(installments(10001, 3), [3334, 3334, 3333]);
  assert.equal(installments(10001, 3).reduce((sum, value) => sum + value, 0), 10001);
});

test('projeta compromisso mensal e respeita fim do mês', () => {
  assert.deepEqual(recurringOccurrences({ active: true, frequency: 'monthly', dayOfMonth: 31, startDate: '2026-01-31' }, '2026-02'), ['2026-02-28']);
  assert.equal(recurringOccurrences({ active: false, frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01' }, '2026-02').length, 0);
});

test('normaliza estabelecimento por nome e alias', () => {
  assert.equal(normalizeMerchant('Farmácia Drogasil - Salvador BA'), 'Farmácia Drogasil');
  assert.equal(normalizeMerchant('mercado alvorada - BA Salvador'), 'Mercado Alvorada');
  assert.equal(normalizeMerchant('DROGASIL SALVADOR', [{ normalizedAlias: 'Drogasil', canonicalName: 'Farmácia Drogasil' }]), 'Farmácia Drogasil');
});

test('importação descarta duplicatas, inclui lançamentos novos e pede revisão dos anteriores', () => {
  const rows = [
    { date: '2026-09-09', description: 'Farmácia Drogasil BA', amountCents: 2500, type: 'expense' },
    { date: '2026-09-08', description: 'Compra antiga sem correspondência', amountCents: 3100, type: 'expense' },
    { date: '2026-09-10', description: 'Padaria', amountCents: 1400, type: 'expense' }
  ];
  const existing = [{ date: '2026-09-09', description: 'Drogasil', amountCents: 2500, type: 'expense', status: 'paid' }];
  const result = classifyImportedRows(rows, existing);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.review.length, 1);
  assert.equal(result.addNow.length, 1);
  assert.equal(result.latestDate, '2026-09-09');
});

test('resumo explica despesas pagas e compromissos do mês e não presume saque de reserva', () => {
  const summary = totalsForMonth({
    month: '2026-10', accountBalanceCents: 10000,
    transactions: [{ id: 1, type: 'expense', date: '2026-10-01', amountCents: 2000, status: 'paid' }],
    projected: [{ id: 'rent', type: 'expense', date: '2026-10-05', amountCents: 9000, status: 'planned' }, { id: 'pay', type: 'income', date: '2026-10-30', amountCents: 5000, status: 'planned' }]
  });
  assert.equal(summary.expenseCents, 11000);
  assert.equal(summary.incomeCents, 5000);
  assert.equal(summary.committedCents, 9000);
  assert.equal(summary.coverageNeededCents, 0);
  assert.equal(summary.projectedEndBalanceCents, 4000);
  assert.deepEqual(summary.expenseExplanation.recordIds, [1, 'rent']);
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});


test('lixeira restaura o estado original de movimenta??es pendentes', () => {
  const pending = { status: 'pending', date: '2026-10-07' };
  const deleted = { ...pending, statusBeforeDelete: getStatusBeforeDelete(pending), status: 'voided' };
  assert.equal(deleted.statusBeforeDelete, 'pending');
  assert.equal(getRestoredTransactionStatus(deleted, '2026-10-08'), 'pending');
  assert.equal(getRestoredTransactionStatus({ status: 'voided', date: '2026-10-07' }, '2026-10-06'), 'planned');
});


test('auditoria de movimenta??es conserva metadados sem duplicar arquivo de comprovante', () => {
  const row = { id: 5, receiptData: { fileName: 'recibo.jpg', dataUrl: 'data:image/jpeg;base64,dGVzdA==' } };
  const safe = auditTransaction(row);
  assert.equal(safe.receiptData.fileName, 'recibo.jpg');
  assert.equal(safe.receiptData.dataUrl, '[comprovante armazenado localmente]');
  assert.equal(row.receiptData.dataUrl, 'data:image/jpeg;base64,dGVzdA==');
});
