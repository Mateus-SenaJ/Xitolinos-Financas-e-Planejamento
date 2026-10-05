const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNotifications } = require('../src/finance-api');

test('card closing reminder honors zero days as the selected threshold', () => {
  const base = {
    today: '2026-10-08', preferences: { cardStopDaysBefore: 0 },
    cardAlerts: [
      { cardId: 1, cardName: 'Principal', daysUntilClosing: 0, message: 'Fecha hoje.' },
      { cardId: 2, cardName: 'Reserva', daysUntilClosing: 1, message: 'Fecha amanhã.' }
    ]
  };
  assert.deepEqual(buildNotifications(base).filter(item => item.kind === 'card-closing').map(item => item.id), ['closing-1']);
});

test('unpaid card bills stay visible after the due date and use the current month', () => {
  const notifications = buildNotifications({
    today: '2026-10-05', preferences: { closeoutDay: 28 },
    cards: [{ id: 7, name: 'Principal', active: true, dueDay: 3 }],
    transactions: [
      { id: 11, cardId: 7, status: 'pending', amountCents: 12450, date: '2026-10-01', dueDate: '2026-10-03' },
      { id: 12, cardId: 7, status: 'pending', amountCents: 5000, date: '2026-09-01', dueDate: '2026-09-03' }
    ]
  });
  const invoice = notifications.find(item => item.kind === 'card-due');
  assert.equal(invoice.month, '2026-10');
  assert.match(invoice.message, /^Venceu em 03\/10/);
  assert.match(invoice.message, /R\$\s?124,50/);
});

test('configured receipt reminders remain visible when the expected date passes', () => {
  const notifications = buildNotifications({
    today: '2026-10-05', preferences: { closeoutDay: 28 },
    incomeSources: [{ id: 3, name: 'Salário', active: true, alertEnabled: true, nextDate: '2026-10-04', reminderDaysBefore: 0, amountCents: 350000 }]
  });
  const receipt = notifications.find(item => item.kind === 'income-due');
  assert.match(receipt.message, /^Estava previsto para 04\/10/);
  assert.equal(receipt.month, '2026-10');
});

test('month close reminder follows the saved closeout day and prior close status', () => {
  const input = { today: '2026-10-04', preferences: { closeoutDay: 5 } };
  assert.equal(buildNotifications(input).some(item => item.kind === 'month-close'), false);
  assert.equal(buildNotifications({ ...input, today: '2026-10-05' }).some(item => item.kind === 'month-close'), true);
  assert.equal(buildNotifications({ ...input, today: '2026-10-05', closes: [{ month: '2026-09' }] }).some(item => item.kind === 'month-close'), false);
});
