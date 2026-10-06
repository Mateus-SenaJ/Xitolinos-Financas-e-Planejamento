'use strict';

const { errors } = require('@strapi/utils');
const crypto = require('node:crypto');
const stripeBilling = require('./integrations/stripe-billing');
const { normalizeShoppingBoard, shoppingListTotalCents } = require('./shopping-board');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const {
  validMonth, monthKey, monthDate, shiftMonth, normalizeMerchant, installments,
  recurringOccurrences, classifyImportedRows, totalsForMonth
} = require('./finance-engine');

const uid = name => `api::${name}.${name}`;
const populate = '*';
const isSharedShoppingViewer = (state, user) => user.profile === 'shopping_viewer'
  && (state.sharedViewerIds || []).some(id => String(id) === String(user.id));
function assertFinanceAccess(user, ctx, write) {
  if (user.profile === 'shopping_viewer' && !(ctx.method === 'GET' && ctx.path === '/api/finance/shopping')) {
    throw new errors.ForbiddenError('Este perfil s\u00F3 pode consultar a lista de compras compartilhada.');
  }
  if (write && user.profile !== 'owner') throw new errors.ForbiddenError('Este perfil pode consultar os dados, mas n\u00E3o pode alter\u00E1-los.');
}

const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const restorableTransactionStatuses = new Set(['paid', 'pending', 'planned', 'settled']);
function getStatusBeforeDelete(row, referenceDate = today()) {
  if (restorableTransactionStatuses.has(row.status)) return row.status;
  if (restorableTransactionStatuses.has(row.statusBeforeDelete)) return row.statusBeforeDelete;
  return row.date <= referenceDate ? 'paid' : 'planned';
}
function getRestoredTransactionStatus(row, referenceDate = today()) {
  return restorableTransactionStatuses.has(row.statusBeforeDelete) ? row.statusBeforeDelete : row.date <= referenceDate ? 'paid' : 'planned';
}
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);

function buildNotifications({ today: date, preferences = {}, cardAlerts = [], cards = [], transactions = [], incomeSources = [], closes = [] }) {
  const currentMonth = date.slice(0, 7);
  const currentDay = Number(date.slice(8, 10));
  const priorMonth = shiftMonth(currentMonth, -1);
  const daysBetween = target => Math.ceil((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  return [
    ...cardAlerts.filter(item => item.daysUntilClosing <= Number(preferences.cardStopDaysBefore ?? 3)).map(item => ({ id: `closing-${item.cardId}`, kind: 'card-closing', title: `Fechamento do ${item.cardName}`, message: item.message, month: currentMonth })),
    ...cards.filter(card => card.active).flatMap(card => {
      const invoiceRows = transactions.filter(row => row.cardId === card.id && row.status !== 'voided' && monthKey(row.dueDate || row.date) === currentMonth);
      const invoiceCents = invoiceRows.reduce((sum, row) => sum + row.amountCents, 0);
      const paidCents = invoiceRows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0);
      if (invoiceCents <= paidCents) return [];
      const monthEnd = new Date(Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0)).getUTCDate();
      const dueDate = `${currentMonth}-${String(Math.min(Number(card.dueDay), monthEnd)).padStart(2, '0')}`;
      const daysUntil = daysBetween(dueDate);
      return daysUntil <= 3 ? [{ id: `invoice-${card.id}-${currentMonth}`, kind: 'card-due', title: `Fatura do ${card.name}`, message: `${daysUntil < 0 ? 'Venceu' : 'Vence'} em ${dueDate.slice(-2)}/${currentMonth.slice(5, 7)}; ${money(invoiceCents - paidCents)} ainda consta em aberto.`, month: currentMonth }] : [];
    }),
    ...incomeSources.filter(item => item.active && item.alertEnabled && item.nextDate).flatMap(item => {
      const daysUntil = daysBetween(item.nextDate);
      return daysUntil <= Number(item.reminderDaysBefore || 0) ? [{ id: `income-${item.id}-${item.nextDate}`, kind: 'income-due', title: `Acompanhe ${item.name}`, message: `${daysUntil < 0 ? 'Estava previsto para' : 'Previsto para'} ${item.nextDate.slice(-2)}/${item.nextDate.slice(5, 7)}: ${money(item.amountCents)}.`, month: item.nextDate.slice(0, 7) }] : [];
    }),
    ...(currentDay >= Number(preferences.closeoutDay || 1) && !closes.some(item => item.month === priorMonth) ? [{ id: `close-${priorMonth}`, kind: 'month-close', title: `Feche ${priorMonth}`, message: 'Confirme o pagamento das faturas e registre se precisou cobrir algum saldo com suas reservas.', month: priorMonth }] : [])
  ];
}
const strip = row => row ? JSON.parse(JSON.stringify(row)) : row;
const webAuthnCeremonies = new Map();
const sensitiveProofs = new Map();
const relyingPartyId = () => process.env.WEBAUTHN_RP_ID || '127.0.0.1';
const relyingPartyOrigin = () => process.env.WEBAUTHN_ORIGIN || 'http://127.0.0.1:5173';

async function verifySensitiveProof(strapi, ctx, user) {
  const credentials = await ownedRows(strapi, 'security-credential', user.id);
  if (!credentials.length) return;
  const [proofId, proofSecret] = String(ctx.get('x-sensitive-proof') || '').split('.', 2);
  const saved = sensitiveProofs.get(proofId);
  const actual = Buffer.from(String(proofSecret || ''));
  const expected = Buffer.from(String(saved?.secret || ''));
  if (!saved || saved.userId !== user.id || saved.expiresAt < Date.now() || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new errors.UnauthorizedError('Confirme esta operação com a biometria do aparelho.');
  sensitiveProofs.delete(proofId);
}

async function ownedRows(strapi, name, userId, sort = undefined) {
  return strapi.entityService.findMany(uid(name), {
    filters: { owner: { id: userId } }, populate, sort, limit: 10000
  });
}

async function ownedRecord(strapi, name, userId, id) {
  const rows = await strapi.entityService.findMany(uid(name), {
    filters: { id: { $eq: id }, owner: { id: { $eq: userId } } }, populate, limit: 1
  });
  if (!rows.length) throw new errors.NotFoundError('Registro não encontrado.');
  return rows[0];
}

async function currentUser(strapi, ctx, write = false, sensitiveRead = false) {
  const value = String(ctx.get('authorization') || '');
  const token = value.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new errors.UnauthorizedError('Entre para acessar seus dados.');
  let payload;
  try { payload = await strapi.plugin('users-permissions').service('jwt').verify(token); }
  catch { throw new errors.UnauthorizedError('Sua sessão expirou. Entre novamente.'); }
  const user = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { id: payload.id } });
  if (!user || user.blocked) throw new errors.UnauthorizedError('Conta indisponível.');
  assertFinanceAccess(user, ctx, write);
  if (write || sensitiveRead) await verifySensitiveProof(strapi, ctx, user);
  ctx.state.user = user;
  return user;
}

async function audit(strapi, user, action, entityType, entityId, before, after) {
  await strapi.entityService.create(uid('audit-event'), { data: {
    action, entityType, entityId: String(entityId || ''), beforeJson: strip(before), afterJson: strip(after), owner: user.id
  } });
}

async function relatedOwned(strapi, name, userId, id) {
  if (!id) return null;
  return ownedRecord(strapi, name, userId, id);
}

function relationId(value) {
  return value && typeof value === 'object' ? value.id : value;
}

function amount(value) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new errors.ValidationError('Informe um valor positivo em centavos.');
  return cents;
}

function nonNegativeCents(value, label) {
  if (typeof value === 'boolean') throw new errors.ValidationError(`${label} precisa ser informado em centavos.`);
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new errors.ValidationError(`${label} precisa ser zero ou um valor positivo em centavos.`);
  return cents;
}

function validateReceiptData(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || !['image/jpeg', 'application/pdf'].includes(value.mimeType)
    || typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith(`data:${value.mimeType};base64,`)
    || Buffer.byteLength(value.dataUrl, 'utf8') > 2_900_000) {
    throw new errors.ValidationError('O comprovante deve ser uma imagem ou PDF local de até 2 MB.');
  }
  const extracted = value.extracted && typeof value.extracted === 'object' ? value.extracted : {};
  return {
    fileName: String(value.fileName || 'comprovante').slice(0, 180), mimeType: value.mimeType,
    dataUrl: value.dataUrl, confidence: Math.max(0, Math.min(100, Number(value.confidence) || 0)),
    extracted: {
      description: String(extracted.description || '').slice(0, 100),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(extracted.date || '')) ? extracted.date : '',
      amountCents: Number.isSafeInteger(Number(extracted.amountCents)) ? Number(extracted.amountCents) : null,
      transactionCode: String(extracted.transactionCode || '').slice(0, 80),
      receiptNumber: String(extracted.receiptNumber || '').slice(0, 60)
    }
  };
}

function auditReceiptData(value) {
  return value ? { ...value, dataUrl: '[comprovante armazenado localmente]' } : value;
}

function auditTransaction(row) {
  return row ? { ...row, receiptData: auditReceiptData(row.receiptData) } : row;
}

function isoDate(value, label = 'Data') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new errors.ValidationError(`${label} inválida.`);
  return value;
}

function accountName(row) { return typeof row?.account === 'object' ? row.account.name : ''; }

function flatTransaction(row) {
  return {
    id: row.id, description: row.description, normalizedMerchant: row.normalizedMerchant,
    type: row.type, amountCents: row.amountCents, date: row.date, dueDate: row.dueDate,
    purchaseDate: row.purchaseDate, method: row.method, status: row.status, source: row.source,
    installmentGroup: row.installmentGroup, installmentNumber: row.installmentNumber,
    spendingContext: row.spendingContext, shoppingImportId: row.shoppingImportId,
    installmentCount: row.installmentCount, categoryId: relationId(row.category),
    category: row.category?.name || 'Outros', accountId: relationId(row.account), accountName: accountName(row),
    cardId: relationId(row.card), cardName: row.card?.name || '', recurrenceId: relationId(row.recurrence),
    incomeSourceId: relationId(row.incomeSource), memo: row.memo || '',
    hasReceipt: Boolean(row.receiptData), receiptFileName: row.receiptData?.fileName || '',
    receiptExtracted: row.receiptData?.extracted || null,
    deletedAt: row.deletedAt || null, paidAt: row.paidAt || null
  };
}

function flatRecord(row) {
  if (!row) return row;
  const { owner: ignoredOwner, ...safe } = row;
  return {
    ...safe,
    category: row.category ? { id: row.category.id, name: row.category.name, type: row.category.type } : null,
    account: row.account ? { id: row.account.id, name: row.account.name, type: row.account.type } : null,
    card: row.card ? { id: row.card.id, name: row.card.name, closingDay: row.card.closingDay, dueDay: row.card.dueDay } : null,
    categoryId: relationId(row.category), accountId: relationId(row.account), cardId: relationId(row.card)
  };
}

function dateOfMonth(value) {
  const [year, month] = validMonth(value).split('-').map(Number);
  return { start: `${value}-01`, end: monthDate(value, 31), year, month };
}

function scheduleDate(schedule, month) {
  return recurringOccurrences(schedule, month);
}

function projectionsFor(month, transactions, recurrences, incomeSources) {
  const result = [];
  for (const item of recurrences) {
    const dates = scheduleDate(item, month);
    for (const date of dates) {
      if (transactions.some(row => relationId(row.recurrence) === item.id && (row.dueDate || row.date) === date && row.status !== 'voided')) continue;
      result.push({
        id: `recurrence-${item.id}-${date}`, description: item.name, type: 'expense',
        amountCents: item.amountCents, date, dueDate: date, method: item.method, status: 'planned',
        source: 'recurrence', categoryId: relationId(item.category), category: item.category?.name || 'Outros',
        accountId: relationId(item.account), accountName: item.account?.name || '', recurrenceId: item.id, projected: true
      });
    }
  }
  for (const item of incomeSources) {
    if (!item.active) continue;
    const dates = scheduleDate({
      active: item.active, frequency: item.frequency === 'once' ? 'once' : item.frequency,
      startDate: item.nextDate, dayOfMonth: Number(String(item.nextDate).slice(8, 10)), endDate: item.endDate
    }, month);
    for (const date of dates) {
      if (transactions.some(row => relationId(row.incomeSource) === item.id && row.date === date && row.status !== 'voided')) continue;
      result.push({
        id: `income-${item.id}-${date}`, description: item.name, type: 'income',
        amountCents: item.amountCents, date, dueDate: date, method: 'account', status: 'planned', source: 'income',
        categoryId: relationId(item.category), category: item.category?.name || 'Outros',
        accountId: relationId(item.account), accountName: item.account?.name || '', incomeSourceId: item.id, projected: true
      });
    }
  }
  return result;
}

function liquidBalanceBefore(cutoff, accounts, transactions) {
  const liquid = new Set(accounts.filter(item => item.isLiquid && item.status !== 'archived').map(item => item.id));
  const accountById = new Map(accounts.map(item => [item.id, item]));
  let balance = accounts.filter(item => liquid.has(item.id) && (!item.openingBalanceDate || item.openingBalanceDate < cutoff)).reduce((sum, item) => sum + Number(item.openingBalanceCents || 0), 0);
  for (const row of transactions) {
    if (row.status !== 'paid' || row.status === 'voided') continue;
    const date = row.paidAt || (row.method === 'card' ? row.dueDate || row.date : row.date);
    if (!date || date >= cutoff) continue;
    const accountId = relationId(row.account), counterpartyId = relationId(row.counterpartyAccount);
    const afterOpening = id => !accountById.get(id)?.openingBalanceDate || date >= accountById.get(id).openingBalanceDate;
    if (row.type === 'income' && liquid.has(accountId) && afterOpening(accountId)) balance += row.amountCents;
    if (row.type === 'expense' && liquid.has(accountId) && afterOpening(accountId)) balance -= row.amountCents;
    if (row.type === 'transfer') {
      if (liquid.has(accountId) && afterOpening(accountId)) balance -= row.amountCents;
      if (liquid.has(counterpartyId) && afterOpening(counterpartyId)) balance += row.amountCents;
    }
  }
  return balance;
}

function balanceAtMonthStart(month, accounts, transactions) {
  return liquidBalanceBefore(dateOfMonth(month).start, accounts, transactions);
}

function categoryTotals(rows) {
  const result = {};
  for (const row of rows.filter(item => item.type === 'expense')) result[row.category || 'Outros'] = (result[row.category || 'Outros'] || 0) + row.amountCents;
  return Object.entries(result).map(([name, amountCents]) => ({ name, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
}

async function dashboardData(strapi, userId, selectedMonth) {
  const month = validMonth(selectedMonth || today().slice(0, 7));
  const [transactionsRaw, accountsRaw, categoriesRaw, cardsRaw, recurrencesRaw, incomesRaw, reserves, goals, budgetsRaw, preferencesRaw, closes, rules] = await Promise.all([
    ownedRows(strapi, 'transaction', userId, { date: 'asc' }), ownedRows(strapi, 'account', userId, { name: 'asc' }),
    ownedRows(strapi, 'category', userId, { name: 'asc' }), ownedRows(strapi, 'card', userId, { name: 'asc' }),
    ownedRows(strapi, 'recurrence', userId, { name: 'asc' }), ownedRows(strapi, 'income-source', userId, { name: 'asc' }),
    ownedRows(strapi, 'reserve', userId, { kind: 'asc' }), ownedRows(strapi, 'goal', userId, { name: 'asc' }),
    ownedRows(strapi, 'budget', userId, { month: 'asc' }), ownedRows(strapi, 'preference', userId),
    ownedRows(strapi, 'month-close', userId, { month: 'desc' }), ownedRows(strapi, 'merchant-rule', userId, { canonicalName: 'asc' })
  ]);
  const transactions = transactionsRaw.map(flatTransaction);
  const historyMonths = Array.from({ length: 12 }, (_, index) => shiftMonth(today().slice(0, 7), index - 11));
  const historyMap = Object.fromEntries(historyMonths.map(period => [period, { month: period, totalCents: 0, routineCents: 0, extraCents: 0 }]));
  for (const row of transactionsRaw) {
    if (row.type !== 'expense' || row.status !== 'paid' || row.deletedAt) continue;
    const period = monthKey(row.paidAt || row.date);
    const point = historyMap[period];
    if (!point) continue;
    point.totalCents += Number(row.amountCents || 0);
    if (row.spendingContext === 'extra') point.extraCents += Number(row.amountCents || 0);
    else point.routineCents += Number(row.amountCents || 0);
  }
  const accounts = accountsRaw.map(flatRecord);
  const cards = cardsRaw.map(flatRecord);
  const recurrences = recurrencesRaw.map(flatRecord);
  const incomeSources = incomesRaw.map(flatRecord);
  const ranges = Array.from({ length: 19 }, (_, index) => shiftMonth(today().slice(0, 7), index - 12));
  if (!ranges.includes(month)) ranges.push(month);
  ranges.sort();
  const monthSummaries = ranges.map(period => {
    const projected = projectionsFor(period, transactionsRaw, recurrencesRaw, incomesRaw);
    const summary = totalsForMonth({
      month: period, transactions: transactions.map(row => ({ ...row, date: row.date, dueDate: row.dueDate })),
      projected, accountBalanceCents: balanceAtMonthStart(period, accountsRaw, transactionsRaw)
    });
    const closeForMonth = closes.find(item => item.month === period);
    const reserveWithdrawalCents = Number(closeForMonth?.reserveWithdrawalCents || 0) + Number(closeForMonth?.savingsWithdrawalCents || 0) + Number(closeForMonth?.investmentWithdrawalCents || 0);
    return {
      month: period, expenseCents: summary.expenseCents, incomeCents: summary.incomeCents,
      committedCents: summary.committedCents, coverageNeededCents: summary.coverageNeededCents,
      projectedEndBalanceCents: summary.projectedEndBalanceCents,
      paidExpenseCents: summary.paidExpenseCents, paidIncomeCents: summary.paidIncomeCents,
      reserveWithdrawalCents, expenseCount: summary.expenses.length, hasDeficit: summary.coverageNeededCents > 0
    };
  });
  const projected = projectionsFor(month, transactionsRaw, recurrencesRaw, incomesRaw);
  const startBalanceCents = balanceAtMonthStart(month, accountsRaw, transactionsRaw);
  const summary = totalsForMonth({ month, transactions, projected, accountBalanceCents: startBalanceCents });
  const rows = [...summary.expenses, ...summary.incomes].sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
  const monthBudgets = budgetsRaw.filter(item => item.month === month).map(flatRecord);
  const used = {};
  for (const row of summary.expenses) used[row.category] = (used[row.category] || 0) + row.amountCents;
  const cardInvoices = cards.map(card => {
    const invoiceRows = transactions.filter(row => row.cardId === card.id && row.status !== 'voided' && monthKey(row.dueDate || row.date) === month);
    return {
      ...card, invoiceCents: invoiceRows.reduce((sum, row) => sum + row.amountCents, 0),
      paidCents: invoiceRows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0),
      lineItems: invoiceRows
    };
  });
  const currentCashCents = liquidBalanceBefore(shiftMonth(today().slice(0, 7), 1) + '-01', accountsRaw, transactionsRaw);
  const prefs = preferencesRaw[0] || {};
  const currentMonth = today().slice(0, 7);
  const currentDay = Number(today().slice(8, 10));
  const cardAlerts = cards.filter(card => card.active).map(card => {
    const closingMonth = card.closingDay >= currentDay ? currentMonth : shiftMonth(currentMonth, 1);
    const closingYear = Number(closingMonth.slice(0, 4));
    const closingMonthNumber = Number(closingMonth.slice(5, 7));
    const closingDay = Math.min(Number(card.closingDay), new Date(Date.UTC(closingYear, closingMonthNumber, 0)).getUTCDate());
    const closingDate = `${closingMonth}-${String(closingDay).padStart(2, '0')}`;
    const untilClosing = Math.ceil((Date.parse(`${closingDate}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000);
    const days = prefs.cardStopDaysBefore ?? 3;
    return { cardId: card.id, cardName: card.name, closingDay: card.closingDay, dueDay: card.dueDay, daysUntilClosing: untilClosing,
      message: untilClosing <= days ? `A fatura fecha em ${card.closingDay}; novas compras entram no próximo ciclo.` : `A fatura fecha no dia ${card.closingDay} e vence no dia ${card.dueDay}.` };
  });
  const minimumReserveCents = Number(prefs.minimumReserveCents || 0);
  const foodCategory = categoriesRaw.find(item => /aliment|restaur|delivery/i.test(normalizeMerchant(item.name)));
  const foodBudget = monthBudgets.find(item => foodCategory && normalizeMerchant(item.categoryName) === normalizeMerchant(foodCategory.name));
  const availableForDeliveryCents = Math.max(0, summary.projectedEndBalanceCents - minimumReserveCents);
  const deliveryBudgetRemainderCents = foodBudget ? Math.max(0, Number(foodBudget.limitCents || 0) - Number(used[foodBudget.categoryName] || 0)) : availableForDeliveryCents;
  const emergencyReserveCents = Number(reserves.find(item => item.kind === 'emergency')?.balanceCents || 0);
  const completedMonths = monthSummaries.filter(item => item.month < currentMonth && item.expenseCents > 0).slice(-3);
  const monthlyExpenseBaselineCents = completedMonths.length
    ? Math.round(completedMonths.reduce((sum, item) => sum + item.expenseCents, 0) / completedMonths.length)
    : recurrencesRaw.filter(item => item.active && item.frequency === 'monthly').reduce((sum, item) => sum + item.amountCents, 0);
  const priorMonth = shiftMonth(currentMonth, -1);
  const notifications = buildNotifications({ today: today(), preferences: prefs, cardAlerts, cards, transactions, incomeSources, closes });
  const delivery = categoryTotals(transactions.filter(row => row.date >= `${currentMonth}-01` && row.date <= today()));
  const close = closes.find(item => item.month === month) || null;
  return {
    month, currentMonth, nextMonth: shiftMonth(currentMonth, 1), currentCashCents,
    totals: { ...summary, expenses: undefined, incomes: undefined },
    details: rows, trash: transactions.filter(row => row.deletedAt), categoryTotals: categoryTotals(summary.expenses), budgets: monthBudgets.map(item => ({ ...item, usedCents: used[item.categoryName] || 0 })),
    accounts, categories: categoriesRaw.map(flatRecord), cards: cardInvoices, recurrences,
    incomeSources, reserves: reserves.map(flatRecord), goals: goals.map(flatRecord), preferences: prefs,
    monthSummaries, spendingHistory: historyMonths.map(period => historyMap[period]), close, cardAlerts, notifications,
    deliverySpending: delivery,
    deliveryRecommendation: {
      month, maximumAmountCents: Math.min(availableForDeliveryCents, deliveryBudgetRemainderCents),
      foodBudgetRemainderCents: foodBudget ? deliveryBudgetRemainderCents : null,
      minimumReserveCents
    },
    reserveSummary: {
      totalCents: reserves.reduce((sum, item) => sum + Number(item.balanceCents || 0), 0),
      emergencyBalanceCents: emergencyReserveCents,
      averageMonthlyExpenseCents: monthlyExpenseBaselineCents,
      emergencyCoverageMonths: monthlyExpenseBaselineCents ? Number((emergencyReserveCents / monthlyExpenseBaselineCents).toFixed(1)) : 0,
      recommendedCoverageMonths: 6
    },
    explanation: summary.expenseExplanation
  };
}

async function defaultAccount(strapi, userId) {
  const accounts = await ownedRows(strapi, 'account', userId, { name: 'asc' });
  const account = accounts.find(item => item.status !== 'archived' && item.isLiquid) || accounts.find(item => item.status !== 'archived');
  if (!account) throw new errors.ValidationError('Cadastre uma conta antes de registrar movimentações.');
  return account;
}

async function createTransaction(strapi, user, input, extra = {}) {
  const type = input.type || 'expense';
  if (!['income','expense','transfer'].includes(type)) throw new errors.ValidationError('Tipo de movimentação inválido.');
  const amountCents = amount(input.amountCents);
  const date = isoDate(input.date || today());
  const account = await relatedOwned(strapi, 'account', user.id, input.accountId) || await defaultAccount(strapi, user.id);
  const category = await relatedOwned(strapi, 'category', user.id, input.categoryId);
  const card = input.method === 'card' ? await relatedOwned(strapi, 'card', user.id, input.cardId) : null;
  if (input.method === 'card' && !card) throw new errors.ValidationError('Selecione um cartão de crédito cadastrado.');
  const method = input.method || 'account';
  const categoryFallback = category || (await ownedRows(strapi, 'category', user.id)).find(item => item.name === 'Outros');
  if (type !== 'transfer' && !categoryFallback) throw new errors.ValidationError('Cadastre uma categoria antes de registrar.');
  if (type === 'transfer' && method !== 'transfer') throw new errors.ValidationError('Transferências precisam usar o método transferência.');
  let destination = null;
  if (type === 'transfer') {
    destination = await relatedOwned(strapi, 'account', user.id, input.counterpartyAccountId);
    if (!destination || destination.id === account.id) throw new errors.ValidationError('Selecione uma conta de destino diferente da origem.');
  }
  const description = String(input.description || '').trim();
  if (!description || description.length > 120) throw new errors.ValidationError('A descrição precisa ter de 1 a 120 caracteres.');
  const count = method === 'card' ? Number(input.installmentCount || 1) : 1;
  const amounts = installments(amountCents, count);
  const group = count > 1 ? `installment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` : null;
  const created = [];
  const firstDue = card ? monthDate(date <= monthDate(monthKey(date), card.closingDay) ? monthKey(date) : shiftMonth(monthKey(date), 1), card.dueDay) : date;
  for (let index = 0; index < count; index += 1) {
    const dueDate = card ? monthDate(shiftMonth(monthKey(firstDue), index), card.dueDay) : date;
    const item = await strapi.entityService.create(uid('transaction'), { data: {
      description, normalizedMerchant: normalizeMerchant(description), type, amountCents: amounts[index], date,
      dueDate, purchaseDate: date, method, status: card ? 'pending' : date <= today() ? 'paid' : 'planned',
      source: card ? 'card' : extra.source || 'manual', installmentGroup: group,
      installmentNumber: count > 1 ? index + 1 : 0, installmentCount: count,
      account: type === 'income' || type === 'transfer' || method !== 'card' ? account.id : card.account?.id || account.id,
      counterpartyAccount: destination?.id, category: categoryFallback?.id, card: card?.id,
      recurrence: extra.recurrenceId, incomeSource: extra.incomeSourceId, shoppingImportId: extra.shoppingImportId,
      spendingContext: type === 'expense' && ['routine','extra'].includes(input.spendingContext) ? input.spendingContext : undefined,
      memo: String(input.memo || '').slice(0, 500), receiptData: index === 0 ? validateReceiptData(input.receiptData) : null, owner: user.id
    } });
    created.push(item);
  }
  await audit(strapi, user, 'create', 'transaction', group || created[0].id, null, created.map(row => ({ ...flatTransaction(row), receiptData: auditReceiptData(row.receiptData) })));
  return { items: created.map(flatTransaction), installmentGroup: group };
}

async function createSchedule(strapi, user, type, input) {
  const amountCents = amount(input.amountCents);
  const name = String(input.name || '').trim();
  if (!name || name.length > 90) throw new errors.ValidationError('Informe um nome com até 90 caracteres.');
  const category = await relatedOwned(strapi, 'category', user.id, input.categoryId);
  const account = await relatedOwned(strapi, 'account', user.id, input.accountId) || await defaultAccount(strapi, user.id);
  const card = input.method === 'card' ? await relatedOwned(strapi, 'card', user.id, input.cardId) : null;
  const frequency = input.frequency || 'monthly';
  if (!['weekly','fortnightly','monthly','yearly','once'].includes(frequency)) throw new errors.ValidationError('Frequência inválida.');
  const startDate = isoDate(input.startDate || input.nextDate || today());
  const data = type === 'recurrence'
    ? { name, amountCents, frequency: frequency === 'once' ? 'monthly' : frequency, dayOfMonth: Number(input.dayOfMonth || startDate.slice(8, 10)), startDate, endDate: input.endDate ? isoDate(input.endDate) : undefined, method: input.method || 'account', active: input.active !== false, category: category?.id, account: account.id, card: card?.id, owner: user.id }
    : { name, amountCents, frequency, nextDate: isoDate(input.nextDate || startDate), endDate: input.endDate ? isoDate(input.endDate) : undefined, reminderDaysBefore: Number(input.reminderDaysBefore || 0), alertEnabled: input.alertEnabled !== false, active: input.active !== false, category: category?.id, account: account.id, owner: user.id };
  const row = await strapi.entityService.create(uid(type), { data });
  await audit(strapi, user, 'create', type, row.id, null, row);
  return flatRecord(row);
}

async function updateSchedule(strapi, user, type, id, input) {
  const previous = await ownedRecord(strapi, type, user.id, id);
  const data = {};
  if (input.name !== undefined) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 90) throw new errors.ValidationError('Informe um nome com até 90 caracteres.');
    data.name = name;
  }
  if (input.amountCents !== undefined) data.amountCents = amount(input.amountCents);
  if (input.frequency !== undefined) {
    if (!['weekly','fortnightly','monthly','yearly','once'].includes(input.frequency)) throw new errors.ValidationError('Frequência inválida.');
    data.frequency = type === 'recurrence' && input.frequency === 'once' ? 'monthly' : input.frequency;
  }
  if (input.startDate !== undefined) data.startDate = isoDate(input.startDate);
  if (input.nextDate !== undefined) data.nextDate = isoDate(input.nextDate);
  if (input.dayOfMonth !== undefined) data.dayOfMonth = Math.max(1, Math.min(31, Number(input.dayOfMonth)));
  if (input.reminderDaysBefore !== undefined && type === 'income-source') data.reminderDaysBefore = Math.max(0, Math.min(30, Number(input.reminderDaysBefore)));
  if (input.categoryId !== undefined) data.category = (await relatedOwned(strapi, 'category', user.id, input.categoryId))?.id;
  if (input.accountId !== undefined) data.account = (await relatedOwned(strapi, 'account', user.id, input.accountId))?.id;
  if (input.method !== undefined && type === 'recurrence') data.method = ['account','pix','cash','debit','card'].includes(input.method) ? input.method : 'account';
  if (input.active !== undefined) data.active = Boolean(input.active);
  const item = await strapi.entityService.update(uid(type), previous.id, { data });
  await audit(strapi, user, 'update', type, item.id, previous, item);
  return flatRecord(item);
}

async function incrementDate(value, frequency) {
  const date = new Date(`${value}T00:00:00Z`);
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === 'fortnightly') date.setUTCDate(date.getUTCDate() + 14);
  else if (frequency === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function parseDateFromText(value) {
  const match = String(value).match(/^(\d{2})[/.](\d{2})(?:[/.](\d{2,4}))?$/);
  if (!match) return null;
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : Number(today().slice(0, 4));
  const date = `${year}-${match[2]}-${match[1]}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
}

function categorizeDescription(description, categories) {
  const name = normalizeMerchant(description);
  const textValue = `${description} ${name}`.toLocaleLowerCase('pt-BR');
  const terms = textValue.includes('farmac') ? ['Saúde'] : /uber|combust|gasolina|posto/.test(textValue) ? ['Transporte'] : /mercad|supermerc/.test(textValue) ? ['Mercado'] : /restaur|sushi|ifood|hamburg|delivery/.test(textValue) ? ['Alimentação'] : ['Outros'];
  return categories.find(item => item.name === terms[0] && item.type === 'expense') || categories.find(item => item.name === 'Outros');
}

function autoProjectionDateFor(textValue, card) {
  const day = Number(textValue.slice(8, 10));
  return monthDate(day <= card.closingDay ? monthKey(textValue) : shiftMonth(monthKey(textValue), 1), card.dueDay);
}

const backupTypes = [
  'account','category','card','recurrence','income-source','reserve','goal','budget','preference',
  'month-close','merchant-rule','desired-purchase','shopping-state','transaction'
];
const backupFields = {
  account: ['name','institution','type','openingBalanceCents','isLiquid','status','notes'],
  category: ['name','type','icon','status','parent'],
  card: ['name','network','lastFour','closingDay','dueDay','limitCents','account','active'],
  recurrence: ['name','amountCents','frequency','dayOfMonth','startDate','endDate','method','active','category','account','card'],
  'income-source': ['name','amountCents','frequency','nextDate','endDate','occurrencesRemaining','reminderDaysBefore','alertEnabled','active','category','account'],
  reserve: ['kind','name','balanceCents','targetCents','annualYieldBasisPoints','account'],
  goal: ['name','targetCents','savedCents','dueDate'],
  budget: ['month','limitCents','category','categoryName'],
  preference: ['theme','accent','minimumReserveCents','cardStopDaysBefore','avatarDataUrl','closeoutDay'],
  'month-close': ['month','cardPaid','deficitCovered','reserveWithdrawalCents','savingsWithdrawalCents','investmentWithdrawalCents','notes','confirmedAt'],
  'merchant-rule': ['alias','normalizedAlias','canonicalName','category'],
  'desired-purchase': ['name','amountCents','urgency','desiredDate','category','status'],
  'shopping-state': ['lists','stock'],
  transaction: ['description','normalizedMerchant','type','amountCents','date','dueDate','purchaseDate','paidAt','method','status','source','installmentGroup','installmentNumber','installmentCount','memo','receiptData','statusBeforeDelete','deletedAt','shoppingImportId','spendingContext','account','counterpartyAccount','category','card','recurrence','incomeSource']
};
const backupRelations = {
  category: { parent: 'category' }, card: { account: 'account' },
  recurrence: { category: 'category', account: 'account', card: 'card' },
  'income-source': { category: 'category', account: 'account' }, reserve: { account: 'account' },
  budget: { category: 'category' }, 'merchant-rule': { category: 'category' },
  'desired-purchase': { category: 'category' },
  transaction: { account: 'account', counterpartyAccount: 'account', category: 'category', card: 'card', recurrence: 'recurrence', incomeSource: 'income-source' }
};

function backupRelationId(value) { return value && typeof value === 'object' ? value.id : value; }
function backupKey(name, row) {
  if (name === 'transaction') return duplicateKey({ ...row, date: row.date || row.purchaseDate });
  if (name === 'account') return row.name;
  if (name === 'category') return `${row.type}|${row.name}`;
  if (name === 'card') return `${row.name}|${row.lastFour || ''}`;
  if (name === 'recurrence' || name === 'income-source' || name === 'goal') return row.name;
  if (name === 'reserve') return row.kind;
  if (name === 'budget') return `${row.month}|${row.categoryName}`;
  if (name === 'preference' || name === 'shopping-state') return 'primary';
  if (name === 'month-close') return row.month;
  if (name === 'merchant-rule') return `${row.normalizedAlias}|${row.canonicalName}`;
  if (name === 'desired-purchase') return `${row.name}|${row.status}`;
  return String(row.id);
}

async function restoreBackup(strapi, user, input) {
  if (input?.schemaVersion !== 1 || input?.application !== 'Xitolinos Planejamento' || !input.records || typeof input.records !== 'object') throw new errors.ValidationError('Este arquivo não é um backup compatível do Xitolinos.');
  if (JSON.stringify(input).length > 25_000_000) throw new errors.ValidationError('O backup excede o limite local de 25 MB.');
  for (const name of backupTypes) if (input.records[name] !== undefined && (!Array.isArray(input.records[name]) || input.records[name].length > 10000)) throw new errors.ValidationError(`A lista ${name} não é válida ou ultrapassa 10.000 registros.`);
  const idMaps = Object.fromEntries(backupTypes.map(name => [name, new Map()]));
  const existingByKey = {};
  for (const name of backupTypes) existingByKey[name] = new Map((await ownedRows(strapi, name, user.id)).map(row => [backupKey(name, row), row]));
  const created = [];
  const counts = Object.fromEntries(backupTypes.map(name => [name, 0]));
  try {
    for (const name of backupTypes) {
      for (const source of input.records[name] || []) {
        const existing = existingByKey[name].get(backupKey(name, source));
        if (existing) idMaps[name].set(String(source.id), existing.id);
      }
    }
    for (const name of backupTypes) {
      for (const source of input.records[name] || []) {
        const oldId = String(source.id || '');
        if (!oldId) throw new errors.ValidationError(`Um registro de ${name} não possui identificador de origem.`);
        if (idMaps[name].has(oldId)) continue;
        const record = {};
        let restoredShoppingState = null;
        if (name === 'shopping-state') {
          try { restoredShoppingState = normalizeShoppingBoard({ lists: source.lists, stock: source.stock }); }
          catch (error) { throw new errors.ValidationError(`Estado de compras inv\u00E1lido no backup: ${error.message}`); }
        }
        for (const field of backupFields[name]) {
          if (source[field] === undefined) continue;
          const targetType = backupRelations[name]?.[field];
          const reference = targetType ? backupRelationId(source[field]) : null;
          record[field] = targetType ? (reference == null ? null : idMaps[targetType].get(String(reference)) || null)
            : restoredShoppingState && (field === 'lists' || field === 'stock') ? restoredShoppingState[field] : source[field];
        }
        const item = await strapi.entityService.create(uid(name), { data: { ...record, owner: user.id } });
        idMaps[name].set(oldId, item.id);
        existingByKey[name].set(backupKey(name, source), item);
        created.push({ name, id: item.id });
        counts[name] += 1;
      }
    }
  } catch (error) {
    for (const item of created.reverse()) await strapi.entityService.delete(uid(item.name), item.id).catch(() => {});
    throw error;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  await audit(strapi, user, 'restore', 'backup', new Date().toISOString(), null, { importedCount: total, counts });
  return { importedCount: total, counts, message: `${total} registros novos foram adicionados. Os itens que já existiam neste aparelho foram preservados.` };
}

function makeActions(strapi) {
  async function withUser(ctx, write, action) {
    const user = await currentUser(strapi, ctx, write);
    const data = await action(user);
    if (data !== undefined) ctx.body = data;
  }
  return {
    securityStatus: ctx => withUser(ctx, false, async user => {
      const credentials = await ownedRows(strapi, 'security-credential', user.id);
      return { enabled: credentials.length > 0, credentialCount: credentials.length, credentials: credentials.map(item => ({ id: item.id, deviceName: item.deviceName, createdAt: item.createdAt })), userVerification: 'required', localOnly: true };
    }),
    registrationOptions: ctx => withUser(ctx, false, async user => {
      if (user.profile !== 'owner') throw new errors.ForbiddenError('Somente o perfil proprietário pode cadastrar biometria.');
      const credentials = await ownedRows(strapi, 'security-credential', user.id);
      const options = await generateRegistrationOptions({
        rpName: 'Xitolinos Planejamento', rpID: relyingPartyId(), userID: Buffer.from(`xitolinos:${user.id}`),
        userName: user.email, userDisplayName: user.username, attestationType: 'none',
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        excludeCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports || [] }))
      });
      webAuthnCeremonies.set(`register:${user.id}`, { challenge: options.challenge, expiresAt: Date.now() + 120000 });
      return options;
    }),
    registrationVerify: ctx => withUser(ctx, true, async user => {
      const ceremony = webAuthnCeremonies.get(`register:${user.id}`);
      webAuthnCeremonies.delete(`register:${user.id}`);
      if (!ceremony || ceremony.expiresAt < Date.now()) throw new errors.UnauthorizedError('A confirmação biométrica expirou. Inicie o cadastro novamente.');
      let result;
      try {
        result = await verifyRegistrationResponse({ response: ctx.request.body?.credential, expectedChallenge: ceremony.challenge, expectedOrigin: relyingPartyOrigin(), expectedRPID: relyingPartyId(), requireUserVerification: true });
      } catch { throw new errors.UnauthorizedError('O aparelho não confirmou a biometria. Tente novamente.'); }
      if (!result.verified || !result.registrationInfo?.credential) throw new errors.UnauthorizedError('O cadastro biométrico não foi validado.');
      const credential = result.registrationInfo.credential;
      if ((await ownedRows(strapi, 'security-credential', user.id)).some(item => item.credentialId === credential.id)) throw new errors.ValidationError('Esta biometria já está cadastrada neste perfil.');
      const item = await strapi.entityService.create(uid('security-credential'), { data: {
        credentialId: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64'), counter: credential.counter,
        transports: credential.transports || [], deviceName: String(ctx.request.body?.deviceName || 'Dispositivo local').slice(0, 80), owner: user.id
      } });
      await audit(strapi, user, 'enroll-biometric', 'security-credential', item.id, null, { deviceName: item.deviceName });
      return { enrolled: true, credentialCount: (await ownedRows(strapi, 'security-credential', user.id)).length, message: 'A biometria deste dispositivo foi cadastrada.' };
    }),
    authenticationOptions: ctx => withUser(ctx, false, async user => {
      const credentials = await ownedRows(strapi, 'security-credential', user.id);
      if (!credentials.length) return { enabled: false };
      const options = await generateAuthenticationOptions({
        rpID: relyingPartyId(), userVerification: 'required',
        allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports || [] }))
      });
      webAuthnCeremonies.set(`authenticate:${user.id}`, { challenge: options.challenge, expiresAt: Date.now() + 120000 });
      return { enabled: true, options };
    }),
    authenticationVerify: ctx => withUser(ctx, false, async user => {
      const ceremony = webAuthnCeremonies.get(`authenticate:${user.id}`);
      webAuthnCeremonies.delete(`authenticate:${user.id}`);
      if (!ceremony || ceremony.expiresAt < Date.now()) throw new errors.UnauthorizedError('A confirmação biométrica expirou. Tente novamente.');
      const assertion = ctx.request.body?.credential;
      const credential = (await ownedRows(strapi, 'security-credential', user.id)).find(item => item.credentialId === assertion?.id);
      if (!credential) throw new errors.UnauthorizedError('A biometria não corresponde a este perfil.');
      let result;
      try {
        result = await verifyAuthenticationResponse({
          response: assertion, expectedChallenge: ceremony.challenge, expectedOrigin: relyingPartyOrigin(), expectedRPID: relyingPartyId(), requireUserVerification: true,
          credential: { id: credential.credentialId, publicKey: Buffer.from(credential.publicKey, 'base64'), counter: credential.counter, transports: credential.transports || [] }
        });
      } catch { throw new errors.UnauthorizedError('O aparelho não confirmou a biometria. Tente novamente.'); }
      if (!result.verified) throw new errors.UnauthorizedError('A confirmação biométrica foi recusada.');
      await strapi.entityService.update(uid('security-credential'), credential.id, { data: { counter: result.authenticationInfo.newCounter } });
      const proofId = crypto.randomUUID();
      const secret = crypto.randomBytes(32).toString('base64url');
      sensitiveProofs.set(proofId, { userId: user.id, secret, expiresAt: Date.now() + 60000 });
      return { proof: `${proofId}.${secret}`, expiresInSeconds: 60 };
    }),
    removeSecurityCredential: ctx => withUser(ctx, false, async user => {
      if (user.profile !== 'owner') throw new errors.ForbiddenError('Somente o perfil proprietário pode remover uma biometria.');
      const password = String(ctx.request.body?.password || '');
      const authService = strapi.plugin('users-permissions').service('user');
      let matches = false;
      try { matches = Boolean(password && await authService.validatePassword(password, user.password)); }
      catch { matches = false; }
      if (!matches) throw new errors.UnauthorizedError('A senha da conta não confere.');
      const credential = await ownedRecord(strapi, 'security-credential', user.id, ctx.request.body?.credentialId);
      await strapi.entityService.delete(uid('security-credential'), credential.id);
      await audit(strapi, user, 'remove-biometric', 'security-credential', credential.id, { deviceName: credential.deviceName }, null);
      return { removed: true, credentialCount: (await ownedRows(strapi, 'security-credential', user.id)).length };
    }),
    dashboard: ctx => withUser(ctx, false, async user => ({ ...(await dashboardData(strapi, user.id, ctx.query.month)), profile: { username: user.username, email: user.email, profile: user.profile } })),
    shoppingState: ctx => withUser(ctx, false, async user => {
      if (user.profile === 'shopping_viewer') {
        const states = await strapi.entityService.findMany(uid('shopping-state'), { populate, limit: 10000 });
        const shared = states.find(row => isSharedShoppingViewer(row, user));
        if (!shared) throw new errors.ForbiddenError('O perfil ainda n\u00E3o recebeu acesso a uma lista.');
        return { lists: shared.lists || [], stock: shared.stock || [] };
      }
      const row = (await ownedRows(strapi, 'shopping-state', user.id))[0];
      return { lists: row?.lists || [], stock: row?.stock || [] };
    }),
    saveShoppingState: ctx => withUser(ctx, true, async user => {
      const current = (await ownedRows(strapi, 'shopping-state', user.id))[0];
      let board;
      try { board = normalizeShoppingBoard(ctx.request.body || {}, current || {}); }
      catch (error) { throw new errors.ValidationError(error.message); }
      const data = { lists: board.lists, stock: board.stock, sharedViewerIds: current?.sharedViewerIds || [], owner: user.id };
      const row = current
        ? await strapi.entityService.update(uid('shopping-state'), current.id, { data })
        : await strapi.entityService.create(uid('shopping-state'), { data });
      await audit(strapi, user, current ? 'update' : 'create', 'shopping-state', row.id, null,
        { listCount: board.lists.length, itemCount: board.lists.reduce((sum, list) => sum + list.items.length, 0), stockCount: board.stock.length });
      return { lists: row.lists || [], stock: row.stock || [] };
    }),
    commitShoppingList: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const month = validMonth(body.month);
      const shoppingState = (await ownedRows(strapi, 'shopping-state', user.id))[0];
      if (!shoppingState) throw new errors.NotFoundError('Lista de compras não encontrada.');
      const lists = shoppingState.lists || [];
      const index = lists.findIndex(item => item.id === String(body.listId || '') && item.month === month);
      if (index < 0) throw new errors.NotFoundError('Lista de compras não encontrada.');
      const list = lists[index];
      const purchaseDate = isoDate(body.date || today());
      if (monthKey(purchaseDate) !== month) throw new errors.ValidationError('A data da compra precisa pertencer ao m\u00EAs da lista.');
      if (list.financialTransactionId) {
        const linked = await ownedRecord(strapi, 'transaction', user.id, list.financialTransactionId);
        return { alreadyRecorded: true, amountCents: linked.amountCents, transaction: flatTransaction(linked) };
      }
      const previousTransaction = (await ownedRows(strapi, 'transaction', user.id)).find(item => item.shoppingImportId === list.id);
      if (previousTransaction) {
        lists[index] = { ...list, financialTransactionId: previousTransaction.id };
        await strapi.entityService.update(uid('shopping-state'), shoppingState.id, { data: { lists, stock: shoppingState.stock || [] } });
        return { alreadyRecorded: true, amountCents: previousTransaction.amountCents, transaction: flatTransaction(previousTransaction) };
      }
      const amountCents = shoppingListTotalCents(list);
      if (!amountCents) throw new errors.ValidationError('Informe o preço pago e marque ao menos um item comprado antes de registrar a despesa.');
      const created = await createTransaction(strapi, user, {
        description: `Compras ${list.name}`.slice(0, 120), amountCents, date: purchaseDate,
        type: 'expense', method: body.method || 'account', accountId: body.accountId,
        categoryId: body.categoryId, memo: `Lista local ${list.id}`
      }, { source: 'shopping', shoppingImportId: list.id });
      lists[index] = { ...list, financialTransactionId: created.items[0].id };
      await strapi.entityService.update(uid('shopping-state'), shoppingState.id, { data: { lists, stock: shoppingState.stock || [] } });
      await audit(strapi, user, 'shopping-expense', 'transaction', created.items[0].id, null, { shoppingListId: list.id, amountCents });
      return { alreadyRecorded: false, amountCents, transaction: created.items[0] };
    }),
    accounts: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'account', user.id, { name: 'asc' })).map(flatRecord) })),
    createAccount: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      if (!String(body.name || '').trim()) throw new errors.ValidationError('Informe o nome da conta.');
      const row = await strapi.entityService.create(uid('account'), { data: {
        name: String(body.name).trim().slice(0, 60), institution: String(body.institution || '').slice(0, 60),
        type: body.type || 'checking', openingBalanceCents: Number(body.openingBalanceCents || 0), openingBalanceDate: body.openingBalanceDate ? isoDate(body.openingBalanceDate) : undefined,
        isLiquid: body.isLiquid !== false, status: 'active', owner: user.id
      } });
      await audit(strapi, user, 'create', 'account', row.id, null, row);
      return { item: flatRecord(row) };
    }),
    updateAccount: ctx => withUser(ctx, true, async user => {
      const previous = await ownedRecord(strapi, 'account', user.id, ctx.params.id);
      const body = ctx.request.body || {};
      const data = {};
      if (body.name !== undefined) {
        const name = String(body.name || '').trim();
        if (!name || name.length > 60) throw new errors.ValidationError('Informe o nome da conta.');
        data.name = name;
      }
      if (body.openingBalanceCents !== undefined) data.openingBalanceCents = nonNegativeCents(body.openingBalanceCents, 'O saldo inicial');
      if (body.openingBalanceDate !== undefined) data.openingBalanceDate = isoDate(body.openingBalanceDate);
      const item = await strapi.entityService.update(uid('account'), previous.id, { data });
      await audit(strapi, user, 'update', 'account', item.id, previous, item);
      return { item: flatRecord(item) };
    }),
    categories: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'category', user.id, { name: 'asc' })).map(flatRecord) })),
    createCategory: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const name = String(body.name || '').trim();
      if (!name) throw new errors.ValidationError('Informe o nome da categoria.');
      const row = await strapi.entityService.create(uid('category'), { data: { name: name.slice(0, 50), type: body.type || 'expense', parent: await relatedOwned(strapi, 'category', user.id, body.parentId).then(item => item?.id), status: 'active', owner: user.id } });
      await audit(strapi, user, 'create', 'category', row.id, null, row);
      return { item: flatRecord(row) };
    }),
    createTransaction: ctx => withUser(ctx, true, user => createTransaction(strapi, user, ctx.request.body || {})),
    resetTransactions: ctx => withUser(ctx, true, async user => {
      const rows = await ownedRows(strapi, 'transaction', user.id);
      const active = rows.filter(row => !row.deletedAt && row.status !== 'voided');
      const deletedAt = new Date().toISOString();
      for (const row of active) await strapi.entityService.update(uid('transaction'), row.id, { data: { statusBeforeDelete: getStatusBeforeDelete(row), status: 'voided', deletedAt } });
      await audit(strapi, user, 'reset-to-trash', 'transaction', user.id, { count: active.length }, { deletedCount: active.length });
      return { deletedCount: active.length };
    }),
    updateTransaction: ctx => withUser(ctx, true, async user => {
      const previous = await ownedRecord(strapi, 'transaction', user.id, ctx.params.id);
      const input = ctx.request.body || {};
      const update = {};
      if (input.description !== undefined) update.description = String(input.description).trim().slice(0, 120);
      if (input.amountCents !== undefined) update.amountCents = amount(input.amountCents);
      if (input.date !== undefined) update.date = isoDate(input.date);
      if (input.categoryId !== undefined) update.category = (await relatedOwned(strapi, 'category', user.id, input.categoryId))?.id;
      if (input.status && ['paid','pending','planned'].includes(input.status)) update.status = input.status;
      if (input.spendingContext !== undefined) {
        if (previous.type !== 'expense') throw new errors.ValidationError('A classifica\u00E7\u00E3o de rotina ou extra s\u00F3 pode ser aplicada a despesas.');
        if (!['routine','extra'].includes(input.spendingContext)) throw new errors.ValidationError('Classificação de despesa inválida.');
        update.spendingContext = input.spendingContext;
      }
      if (input.memo !== undefined) update.memo = String(input.memo).slice(0, 500);
      if (input.receiptData !== undefined) update.receiptData = validateReceiptData(input.receiptData);
      const item = await strapi.entityService.update(uid('transaction'), previous.id, { data: update });
      await audit(strapi, user, 'update', 'transaction', item.id, auditTransaction(previous), auditTransaction(item));
      return { item: flatTransaction(item) };
    }),
    getTransactionReceipt: ctx => withUser(ctx, false, async user => {
      const row = await ownedRecord(strapi, 'transaction', user.id, ctx.params.id);
      if (!row.receiptData) throw new errors.NotFoundError('Este lançamento não tem comprovante anexado.');
      return { receipt: row.receiptData };
    }),
    deleteTransaction: ctx => withUser(ctx, true, async user => {
      const previous = await ownedRecord(strapi, 'transaction', user.id, ctx.params.id);
      const statusBeforeDelete = getStatusBeforeDelete(previous);
      const item = await strapi.entityService.update(uid('transaction'), previous.id, { data: { statusBeforeDelete, status: 'voided', deletedAt: new Date().toISOString() } });
      await audit(strapi, user, 'trash', 'transaction', item.id, auditTransaction(previous), auditTransaction(item));
      return { item: flatTransaction(item) };
    }),
    restoreTransaction: ctx => withUser(ctx, true, async user => {
      const previous = await ownedRecord(strapi, 'transaction', user.id, ctx.params.id);
      const status = getRestoredTransactionStatus(previous);
      const item = await strapi.entityService.update(uid('transaction'), previous.id, { data: { status, statusBeforeDelete: null, deletedAt: null } });
      await audit(strapi, user, 'restore', 'transaction', item.id, auditTransaction(previous), auditTransaction(item));
      return { item: flatTransaction(item) };
    }),
    cards: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'card', user.id, { name: 'asc' })).map(flatRecord) })),
    createCard: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const closingDay = Number(body.closingDay), dueDay = Number(body.dueDay);
      if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new errors.ValidationError('Fechamento e vencimento precisam ser dias entre 1 e 31.');
      const account = await relatedOwned(strapi, 'account', user.id, body.accountId) || await defaultAccount(strapi, user.id);
      const row = await strapi.entityService.create(uid('card'), { data: { name: String(body.name || 'Cartão').trim().slice(0, 60), network: String(body.network || '').slice(0, 30), lastFour: String(body.lastFour || '').slice(-4), closingDay, dueDay, limitCents: Number(body.limitCents || 0), account: account.id, active: true, owner: user.id } });
      await audit(strapi, user, 'create', 'card', row.id, null, row);
      return { item: flatRecord(row) };
    }),
    updateCard: ctx => withUser(ctx, true, async user => {
      const previous = await ownedRecord(strapi, 'card', user.id, ctx.params.id);
      const body = ctx.request.body || {};
      const data = {};
      if (body.name !== undefined) { const name = String(body.name || '').trim(); if (!name || name.length > 60) throw new errors.ValidationError('Informe o nome do cartão.'); data.name = name; }
      for (const field of ['closingDay','dueDay']) if (body[field] !== undefined) {
        const day = Number(body[field]);
        if (!Number.isInteger(day) || day < 1 || day > 31) throw new errors.ValidationError('Fechamento e vencimento precisam ser dias entre 1 e 31.');
        data[field] = day;
      }
      if (body.limitCents !== undefined) data.limitCents = nonNegativeCents(body.limitCents, 'O limite do cartão');
      if (body.network !== undefined) data.network = String(body.network || '').slice(0, 30);
      if (body.lastFour !== undefined) data.lastFour = String(body.lastFour || '').slice(-4);
      if (body.accountId !== undefined) data.account = (await relatedOwned(strapi, 'account', user.id, body.accountId))?.id;
      const item = await strapi.entityService.update(uid('card'), previous.id, { data });
      await audit(strapi, user, 'update', 'card', item.id, previous, item);
      return { item: flatRecord(item) };
    }),
    settleCard: ctx => withUser(ctx, true, async user => {
      const card = await ownedRecord(strapi, 'card', user.id, ctx.params.id);
      const month = validMonth(ctx.request.body?.month);
      const rows = await ownedRows(strapi, 'transaction', user.id);
      const invoice = rows.filter(row => relationId(row.card) === card.id && row.type === 'expense' && row.status !== 'voided' && monthKey(row.dueDate || row.date) === month && row.status !== 'paid');
      const updated = [];
      for (const row of invoice) updated.push(await strapi.entityService.update(uid('transaction'), row.id, { data: { status: 'paid', paidAt: today(), account: card.account?.id || row.account?.id } }));
      await audit(strapi, user, 'settle-invoice', 'card', card.id, { month, count: invoice.length }, { month, paidCents: invoice.reduce((sum, row) => sum + row.amountCents, 0) });
      return { paidCount: updated.length, paidCents: invoice.reduce((sum, row) => sum + row.amountCents, 0) };
    }),
    settleInstallments: ctx => withUser(ctx, true, async user => {
      const group = String(ctx.params.group || '');
      const paidAmountCents = amount(ctx.request.body?.paidAmountCents);
      const rows = await ownedRows(strapi, 'transaction', user.id);
      const groupRows = rows.filter(row => row.installmentGroup === group && row.status !== 'voided');
      if (!groupRows.length) throw new errors.NotFoundError('Parcelamento não encontrado.');
      const remaining = groupRows.filter(row => row.status !== 'paid');
      for (const row of remaining) await strapi.entityService.update(uid('transaction'), row.id, { data: { statusBeforeDelete: getStatusBeforeDelete(row), status: 'voided', deletedAt: new Date().toISOString() } });
      const created = await createTransaction(strapi, user, {
        description: `Quitação: ${groupRows[0].description}`, type: 'expense', amountCents: paidAmountCents,
        date: today(), method: 'account', categoryId: relationId(groupRows[0].category), accountId: relationId(groupRows[0].account)
      }, { source: 'manual' });
      await audit(strapi, user, 'settle-installments', 'transaction', group, groupRows.map(auditTransaction), { paidAmountCents, canceledCount: remaining.length });
      return { items: created.items, canceledCount: remaining.length };
    }),
    recurrences: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'recurrence', user.id, { name: 'asc' })).map(flatRecord) })),
    createRecurrence: ctx => withUser(ctx, true, user => createSchedule(strapi, user, 'recurrence', ctx.request.body || {}).then(item => ({ item }))),
    updateRecurrence: ctx => withUser(ctx, true, user => updateSchedule(strapi, user, 'recurrence', ctx.params.id, ctx.request.body || {}).then(item => ({ item }))),
    completeRecurrence: ctx => withUser(ctx, true, async user => {
      const recurrence = await ownedRecord(strapi, 'recurrence', user.id, ctx.params.id);
      const date = isoDate(ctx.request.body?.date || today());
      const allTransactions = await ownedRows(strapi, 'transaction', user.id);
      if (allTransactions.some(row => relationId(row.recurrence) === recurrence.id && (row.dueDate || row.date) === date && row.status !== 'voided')) throw new errors.ValidationError('Esta despesa já foi contabilizada nessa data.');
      const result = await createTransaction(strapi, user, {
        description: recurrence.name, type: 'expense', amountCents: recurrence.amountCents, date,
        method: recurrence.method, categoryId: relationId(recurrence.category), accountId: relationId(recurrence.account), cardId: relationId(recurrence.card), installmentCount: 1
      }, { recurrenceId: recurrence.id, source: 'recurrence' });
      return { item: result.items[0] };
    }),
    incomeSources: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'income-source', user.id, { nextDate: 'asc' })).map(flatRecord) })),
    createIncomeSource: ctx => withUser(ctx, true, user => createSchedule(strapi, user, 'income-source', ctx.request.body || {}).then(item => ({ item }))),
    updateIncomeSource: ctx => withUser(ctx, true, user => updateSchedule(strapi, user, 'income-source', ctx.params.id, ctx.request.body || {}).then(item => ({ item }))),
    receiveIncome: ctx => withUser(ctx, true, async user => {
      const source = await ownedRecord(strapi, 'income-source', user.id, ctx.params.id);
      const date = isoDate(ctx.request.body?.date || today());
      const result = await createTransaction(strapi, user, {
        description: source.name, type: 'income', amountCents: Number(ctx.request.body?.amountCents || source.amountCents), date,
        method: 'account', categoryId: relationId(source.category), accountId: relationId(source.account), receiptData: ctx.request.body?.receiptData
      }, { incomeSourceId: source.id, source: 'manual' });
      const nextDate = source.frequency === 'once' ? source.nextDate : await incrementDate(source.nextDate, source.frequency);
      const occurrencesRemaining = source.occurrencesRemaining ? Math.max(0, source.occurrencesRemaining - 1) : null;
      const active = source.frequency !== 'once' && (occurrencesRemaining === null || occurrencesRemaining > 0) && (!source.endDate || nextDate <= source.endDate);
      await strapi.entityService.update(uid('income-source'), source.id, { data: { nextDate, occurrencesRemaining, active } });
      await audit(strapi, user, 'received', 'income-source', source.id, source, { nextDate, active });
      return { item: result.items[0], nextDate, active };
    }),
    reserves: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'reserve', user.id, { kind: 'asc' })).map(flatRecord) })),
    upsertReserve: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      if (!['emergency','savings','investment'].includes(body.kind)) throw new errors.ValidationError('Tipo de reserva inválido.');
      const current = (await ownedRows(strapi, 'reserve', user.id)).find(row => row.kind === body.kind);
      const account = await relatedOwned(strapi, 'account', user.id, body.accountId) || current?.account || await defaultAccount(strapi, user.id);
      const data = {
        kind: body.kind, name: String(body.name || current?.name || body.kind).trim().slice(0, 70),
        balanceCents: Number(body.balanceCents ?? current?.balanceCents ?? 0), targetCents: Number(body.targetCents ?? current?.targetCents ?? 0),
        annualYieldBasisPoints: Number(body.annualYieldBasisPoints ?? current?.annualYieldBasisPoints ?? 0), account: account.id, owner: user.id
      };
      const row = current ? await strapi.entityService.update(uid('reserve'), current.id, { data }) : await strapi.entityService.create(uid('reserve'), { data });
      await audit(strapi, user, current ? 'update' : 'create', 'reserve', row.id, current, row);
      return { item: flatRecord(row) };
    }),
    reserveMovement: ctx => withUser(ctx, true, async user => {
      const reserve = await ownedRecord(strapi, 'reserve', user.id, ctx.params.id);
      const body = ctx.request.body || {};
      const cents = amount(body.amountCents);
      if (body.confirmed !== true) throw new errors.ValidationError('Confirme a movimentação para atualizar o saldo da reserva.');
      const sign = body.direction === 'withdraw' ? -1 : body.direction === 'deposit' ? 1 : 0;
      if (!sign) throw new errors.ValidationError('Escolha entre guardar ou retirar.');
      if (sign < 0 && cents > reserve.balanceCents) throw new errors.ValidationError('O valor supera o saldo cadastrado na reserva.');
      const reserveAccount = reserve.account || (await defaultAccount(strapi, user.id));
      const cashAccount = await defaultAccount(strapi, user.id);
      if (relationId(reserveAccount) === cashAccount.id) throw new errors.ValidationError('Associe esta reserva a uma conta diferente da conta do dia a dia para registrar transferências.');
      const transfer = await createTransaction(strapi, user, {
        description: sign > 0 ? `Aporte em ${reserve.name}` : `Resgate de ${reserve.name}`,
        type: 'transfer', amountCents: cents, date: today(), method: 'transfer',
        accountId: sign > 0 ? cashAccount.id : relationId(reserveAccount),
        counterpartyAccountId: sign > 0 ? relationId(reserveAccount) : cashAccount.id
      }, { source: 'manual' });
      const item = await strapi.entityService.update(uid('reserve'), reserve.id, { data: { balanceCents: reserve.balanceCents + sign * cents } });
      await audit(strapi, user, sign > 0 ? 'deposit' : 'withdraw', 'reserve', reserve.id, reserve, item);
      return { item: flatRecord(item), transfer: transfer.items[0] };
    }),
    goals: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'goal', user.id, { name: 'asc' })).map(flatRecord) })),
    createGoal: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const name = String(body.name || '').trim();
      if (!name) throw new errors.ValidationError('Informe o nome da meta.');
      const row = await strapi.entityService.create(uid('goal'), { data: {
        name: name.slice(0, 80), targetCents: amount(body.targetCents), savedCents: Number(body.savedCents || 0),
        dueDate: body.dueDate ? isoDate(body.dueDate) : undefined, owner: user.id
      } });
      await audit(strapi, user, 'create', 'goal', row.id, null, row);
      return { item: flatRecord(row) };
    }),
    budgets: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'budget', user.id, { month: 'asc' })).map(flatRecord) })),
    upsertBudget: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const month = validMonth(body.month);
      const category = await relatedOwned(strapi, 'category', user.id, body.categoryId);
      const categoryName = category?.name || String(body.categoryName || '').trim();
      if (!categoryName) throw new errors.ValidationError('Selecione a categoria do orçamento.');
      const current = (await ownedRows(strapi, 'budget', user.id)).find(row => row.month === month && row.categoryName === categoryName);
      const data = { month, categoryName, category: category?.id, limitCents: amount(body.limitCents), owner: user.id };
      const item = current ? await strapi.entityService.update(uid('budget'), current.id, { data }) : await strapi.entityService.create(uid('budget'), { data });
      await audit(strapi, user, current ? 'update' : 'create', 'budget', item.id, current, item);
      return { item: flatRecord(item) };
    }),
    preferences: ctx => withUser(ctx, false, async user => ({ item: flatRecord((await ownedRows(strapi, 'preference', user.id))[0] || {}) })),
    updatePreferences: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const current = (await ownedRows(strapi, 'preference', user.id))[0];
      const theme = ['light','dark','system'].includes(body.theme) ? body.theme : current?.theme || 'light';
      const accent = ['green','lime','gold'].includes(body.accent) ? body.accent : current?.accent || 'green';
      const avatarDataUrl = body.avatarDataUrl === undefined ? current?.avatarDataUrl : String(body.avatarDataUrl || '');
      if (avatarDataUrl && (!/^data:image\/(png|jpeg|webp);base64,/.test(avatarDataUrl) || avatarDataUrl.length > 1400000)) throw new errors.ValidationError('A foto deve ser PNG, JPEG ou WebP com até 1 MB.');
      const data = {
        theme, accent, minimumReserveCents: Math.max(0, Number(body.minimumReserveCents ?? current?.minimumReserveCents ?? 0)),
        cardStopDaysBefore: Math.min(15, Math.max(0, Number(body.cardStopDaysBefore ?? current?.cardStopDaysBefore ?? 3))),
        closeoutDay: Math.min(28, Math.max(1, Number(body.closeoutDay ?? current?.closeoutDay ?? 1))), avatarDataUrl, owner: user.id
      };
      const item = current ? await strapi.entityService.update(uid('preference'), current.id, { data }) : await strapi.entityService.create(uid('preference'), { data });
      await audit(strapi, user, 'preferences', 'preference', item.id, current, { ...data, avatarDataUrl: avatarDataUrl ? '[imagem]' : '' });
      return { item: flatRecord(item) };
    }),
    spendDecision: ctx => withUser(ctx, false, async user => {
      const input = ctx.request.body || {};
      const cents = amount(input.amountCents);
      const period = validMonth(input.month || today().slice(0, 7));
      const data = await dashboardData(strapi, user.id, period);
      const preference = data.preferences;
      const requestedCategory = String(input.category || '').trim();
      const categoryBudget = data.budgets.find(item => normalizeMerchant(item.categoryName) === normalizeMerchant(requestedCategory));
      const categoryBudgetRemainderCents = categoryBudget ? Math.max(0, categoryBudget.limitCents - categoryBudget.usedCents) : null;
      const availableBeforePurchaseCents = Math.max(0, data.totals.projectedEndBalanceCents - Number(preference.minimumReserveCents || 0));
      const maximumRecommendedCents = Math.min(availableBeforePurchaseCents, categoryBudgetRemainderCents ?? availableBeforePurchaseCents);
      const afterPurchase = data.totals.projectedEndBalanceCents - cents;
      const minimum = Number(preference.minimumReserveCents || 0);
      const recommended = cents <= maximumRecommendedCents && afterPurchase >= minimum;
      return {
        recommended,
        message: recommended
          ? `A compra cabe na projeção deste mês, preservando a margem mínima configurada.${categoryBudget ? ` Restam ${money(categoryBudgetRemainderCents)} no limite de ${requestedCategory}.` : ''}`
          : categoryBudget && cents > categoryBudgetRemainderCents
            ? `Esse gasto passa ${money(categoryBudgetRemainderCents)} disponíveis no limite de ${requestedCategory}. Aguarde ou ajuste o orçamento antes de confirmar.`
            : input.urgency === 'high'
              ? 'Mesmo sendo urgente, o valor deixaria o saldo abaixo da margem mínima configurada. Confira outra fonte de cobertura antes de comprar.'
              : 'A compra não é recomendada: a projeção ficaria abaixo do valor necessário para os compromissos e a margem de segurança.',
        amountCents: cents, projectedBeforeCents: data.totals.projectedEndBalanceCents,
        projectedAfterCents: afterPurchase, minimumReserveCents: minimum,
        coverageNeededCents: Math.max(0, minimum - afterPurchase), month: period,
        maximumRecommendedCents, categoryBudgetRemainderCents,
        countedExpenses: data.details.filter(row => row.type === 'expense').map(row => ({ description: row.description, amountCents: row.amountCents, date: row.dueDate || row.date, status: row.status }))
      };
    }),
    closeMonth: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      const month = validMonth(body.month);
      const current = (await ownedRows(strapi, 'month-close', user.id)).find(row => row.month === month);
      const reserveAmount = nonNegativeCents(body.reserveWithdrawalCents ?? 0, 'Retirada da reserva');
      const savingsAmount = nonNegativeCents(body.savingsWithdrawalCents ?? 0, 'Retirada da poupanca');
      const investmentAmount = nonNegativeCents(body.investmentWithdrawalCents ?? 0, 'Retirada dos investimentos');
      const withdrawals = [['emergency', reserveAmount], ['savings', savingsAmount], ['investment', investmentAmount]].filter(([, cents]) => cents > 0);
      if (withdrawals.length && body.confirmedWithdrawals !== true) throw new errors.ValidationError('Confirme que as retiradas aconteceram antes de atualizar as reservas.');
      const cash = await defaultAccount(strapi, user.id);
      for (const [kind, cents] of withdrawals) {
        amount(cents);
        const reserve = (await ownedRows(strapi, 'reserve', user.id)).find(row => row.kind === kind);
        if (!reserve || cents > reserve.balanceCents) throw new errors.ValidationError(`Saldo insuficiente em ${kind === 'emergency' ? 'reserva de emergência' : kind === 'savings' ? 'poupança' : 'investimentos'}.`);
        const reserveAccount = reserve.account;
        if (!reserveAccount || relationId(reserveAccount) === cash.id) throw new errors.ValidationError('Associe a reserva a uma conta diferente da conta do dia a dia.');
        await createTransaction(strapi, user, {
          description: `Resgate no fechamento de ${month}`, type: 'transfer', method: 'transfer', date: today(), amountCents: cents,
          accountId: relationId(reserveAccount), counterpartyAccountId: cash.id
        });
        await strapi.entityService.update(uid('reserve'), reserve.id, { data: { balanceCents: reserve.balanceCents - cents } });
      }
      if (body.cardPaid === true) {
        const cards = await ownedRows(strapi, 'card', user.id);
        const transactions = await ownedRows(strapi, 'transaction', user.id);
        for (const card of cards) for (const row of transactions.filter(item => relationId(item.card) === card.id && item.type === 'expense' && item.status !== 'voided' && item.status !== 'paid' && monthKey(item.dueDate || item.date) === month)) {
          await strapi.entityService.update(uid('transaction'), row.id, { data: { status: 'paid', paidAt: today(), account: relationId(card.account) || relationId(row.account) } });
        }
      }
      const data = {
        month, cardPaid: body.cardPaid === true, deficitCovered: body.deficitCovered === true,
        reserveWithdrawalCents: reserveAmount, savingsWithdrawalCents: savingsAmount, investmentWithdrawalCents: investmentAmount,
        notes: String(body.notes || '').slice(0, 1000), confirmedAt: new Date().toISOString(), owner: user.id
      };
      const item = current ? await strapi.entityService.update(uid('month-close'), current.id, { data }) : await strapi.entityService.create(uid('month-close'), { data });
      await audit(strapi, user, 'close-month', 'month-close', item.id, current, item);
      return { item: flatRecord(item), dashboard: await dashboardData(strapi, user.id, month) };
    }),
    inspectImport: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      if (!Array.isArray(body.rows) || body.rows.length > 2000) throw new errors.ValidationError('Selecione um arquivo com até 2.000 linhas.');
      const incoming = body.rows.map(row => ({
        description: String(row.description || row.merchant || '').trim().slice(0, 120),
        date: isoDate(row.date), amountCents: amount(row.amountCents), type: row.type === 'income' ? 'income' : 'expense',
        method: ['pix','cash','debit','card','account'].includes(row.method) ? row.method : 'account',
        memo: String(row.memo || '').slice(0, 300)
      }));
      if (incoming.some(row => !row.description)) throw new errors.ValidationError('Algum item importado está sem descrição.');
      const previous = (await ownedRows(strapi, 'transaction', user.id)).map(flatTransaction);
      const inspected = classifyImportedRows(incoming, previous);
      const categories = await ownedRows(strapi, 'category', user.id);
      const added = [];
      for (const row of inspected.addNow) {
        const category = categorizeDescription(row.description, categories);
        const created = await createTransaction(strapi, user, { ...row, categoryId: category?.id }, { source: 'import' });
        added.push(...created.items);
      }
      const batch = await strapi.entityService.create(uid('import-batch'), { data: {
        fileName: String(body.fileName || 'importação').slice(0, 180), status: inspected.review.length ? 'review' : 'completed',
        duplicateCount: inspected.duplicates.length, acceptedCount: added.length, owner: user.id
      } });
      await audit(strapi, user, 'import', 'import-batch', batch.id, null, { duplicateCount: inspected.duplicates.length, acceptedCount: added.length, reviewCount: inspected.review.length });
      return { batchId: batch.id, added, duplicates: inspected.duplicates, review: inspected.review, latestDate: inspected.latestDate };
    }),
    confirmImport: ctx => withUser(ctx, true, async user => {
      const body = ctx.request.body || {};
      if (!Array.isArray(body.rows) || body.rows.length > 2000) throw new errors.ValidationError('Selecione as linhas para importar.');
      const categories = await ownedRows(strapi, 'category', user.id);
      const previous = (await ownedRows(strapi, 'transaction', user.id)).map(flatTransaction);
      const created = [];
      for (const row of body.rows) {
        const candidate = { description: String(row.description || '').trim().slice(0, 120), date: isoDate(row.date), amountCents: amount(row.amountCents), type: row.type === 'income' ? 'income' : 'expense', method: ['pix','cash','debit','card','account'].includes(row.method) ? row.method : 'account' };
        if (!candidate.description || previous.some(item => item.status !== 'voided' && item.date === candidate.date && item.amountCents === candidate.amountCents && normalizeMerchant(item.description) === normalizeMerchant(candidate.description) && item.type === candidate.type)) continue;
        const category = categorizeDescription(candidate.description, categories);
        const result = await createTransaction(strapi, user, { ...candidate, categoryId: category?.id }, { source: 'import' });
        created.push(...result.items);
        previous.push(...result.items);
      }
      if (body.batchId) {
        const batch = await ownedRecord(strapi, 'import-batch', user.id, body.batchId);
        await strapi.entityService.update(uid('import-batch'), batch.id, { data: { status: 'completed', acceptedCount: Number(batch.acceptedCount || 0) + created.length } });
      }
      return { items: created, count: created.length };
    }),
    exportMonth: ctx => withUser(ctx, false, async user => {
      await verifySensitiveProof(strapi, ctx, user);
      if (ctx.query.format === 'backup') {
        const tables = backupTypes;
        const values = await Promise.all(tables.map(name => ownedRows(strapi, name, user.id)));
        ctx.type = 'application/json';
        return { schemaVersion: 1, application: 'Xitolinos Planejamento', exportedAt: new Date().toISOString(), records: Object.fromEntries(tables.map((name, index) => [name, values[index].map(row => {
          const { owner: ignoredOwner, ...record } = row;
          for (const relationName of Object.keys(backupRelations[name] || {})) record[relationName] = backupRelationId(record[relationName]);
          delete record.createdAt; delete record.updatedAt; delete record.publishedAt; delete record.documentId;
          return record;
        })])) };
      }
      const data = await dashboardData(strapi, user.id, validMonth(ctx.query.month || today().slice(0, 7)));
      const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
      const money = cents => formatter.format(cents / 100);
      const lines = [
        `XITOLINOS PLANEJAMENTO — ${data.month}`,
        `Entradas esperadas: ${money(data.totals.incomeCents)}`,
        `Despesas contabilizadas e previstas: ${money(data.totals.expenseCents)}`,
        `Compromissos futuros: ${money(data.totals.committedCents)}`,
        `Saldo projetado: ${money(data.totals.projectedEndBalanceCents)}`,
        `Necessário cobrir: ${money(data.totals.coverageNeededCents)}`,
        '', 'DESPESAS CONSIDERADAS', ...data.details.filter(row => row.type === 'expense').map(row => `${row.date} | ${row.description} | ${row.category} | ${row.status} | ${money(row.amountCents)}`),
        '', 'Exportado localmente pelo Xitolinos Planejamento.'
      ];
      ctx.type = 'text/plain; charset=utf-8';
      return { text: lines.join('\n'), month: data.month };
    }),
    restoreBackup: ctx => withUser(ctx, true, user => restoreBackup(strapi, user, ctx.request.body)),
    audit: ctx => withUser(ctx, false, async user => ({ items: (await ownedRows(strapi, 'audit-event', user.id, { createdAt: 'desc' })).slice(0, 100).map(row => {
      const { owner: ignoredOwner, ...safe } = row;
      return safe;
    }) })),
    billingStatus: ctx => withUser(ctx, false, async user => {
      const subscription = (await ownedRows(strapi, 'billing-subscription', user.id))[0] || { provider: 'local', plan: 'local', status: 'local' };
      const stripeEnabled = process.env.BILLING_ENABLED === 'true';
      return {
        mode: stripeEnabled ? 'stripe' : 'local',
        checkoutReady: stripeBilling.isConfigured() && (!subscription.subscriptionId || ['canceled', 'incomplete_expired'].includes(subscription.status)),
        manageReady: stripeBilling.isConfigured({ requirePrice: false }) && Boolean(subscription.customerId),
        subscription: { plan: subscription.plan, status: subscription.status },
        message: !stripeEnabled
          ? 'A cobrança fica desligada no modo local e offline.'
          : stripeBilling.isConfigured()
            ? 'A assinatura é gerenciada separadamente dos seus dados financeiros locais.'
            : 'A configuração da assinatura ainda não foi concluída.'
      };
    }),
    billingCheckout: ctx => withUser(ctx, true, user => stripeBilling.createCheckout(strapi, user)),
    billingPortal: ctx => withUser(ctx, true, user => stripeBilling.createPortalSession(strapi, user)),
    stripeWebhook: ctx => stripeBilling.handleWebhook(strapi, ctx)
  };
}

async function seedPurchaseRemainder() { return null; }

module.exports = { makeActions, buildNotifications, assertFinanceAccess, isSharedShoppingViewer, normalizeMerchant, installments, recurringOccurrences, classifyImportedRows, totalsForMonth, validMonth, monthDate, shiftMonth, parseDateFromText, autoProjectionDateFor, incrementDate, getStatusBeforeDelete, getRestoredTransactionStatus, auditTransaction };
