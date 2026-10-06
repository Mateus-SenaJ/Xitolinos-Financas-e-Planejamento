import { readMobileState, updateMobileState, writeMobileState } from './sqlite-store.js';
import { createInitialMobileState, DEMO_CREDENTIALS } from './seed-state.js';
import { buildMobileDashboard, classifyImportedRows, duplicateKey, installments, monthDate, monthKey, normalizeMerchant, recurringOccurrences, shiftMonth, validMonth } from './finance-domain.js';

const encoder = new TextEncoder();
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const moneyText = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
const makeSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('');
const toHex = bytes => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 180000, hash: 'SHA-256' }, key, 256);
  return toHex(result);
}

function decodeBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try { return JSON.parse(body); } catch { throw new Error('Os dados enviados não estão em um formato válido.'); }
}

function getSession(state, token) {
  const session = (state.sessions || []).find(item => item.token === String(token || '') && item.expiresAt > Date.now());
  const user = state.users.find(item => item.id === session?.userId);
  if (!user) throw new Error('Entre para acessar seus dados locais.');
  return user;
}

function requireOwner(user) {
  if (user.profile !== 'owner') throw new Error('Este perfil pode consultar somente a lista de compras.');
}

function recordAudit(state, action, entityType, entityId, before = null, after = null) {
  state.auditEvents.unshift({ id: state.nextId++, action, entityType, entityId: String(entityId || ''), beforeJson: before, afterJson: after, createdAt: new Date().toISOString() });
  state.auditEvents = state.auditEvents.slice(0, 1000);
}

function amount(value) {
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Informe um valor positivo em centavos.');
  return cents;
}

function dateValue(value, label = 'Data') {
  const result = String(value || '');
  const parsed = new Date(`${result}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw new Error(`${label} inválida.`);
  return result;
}

function activeAccount(state, id) {
  const item = state.accounts.find(row => row.id === Number(id) && row.status !== 'archived');
  if (!item) throw new Error('Cadastre ou selecione uma conta ativa.');
  return item;
}

function category(state, id, type) {
  const item = state.categories.find(row => row.id === Number(id) && row.status !== 'archived' && (!type || row.type === type));
  if (!item) throw new Error('Selecione uma categoria ativa compatível com o lançamento.');
  return item;
}

function createTransaction(state, input, extra = {}) {
  const type = input.type || 'expense';
  if (!['income', 'expense', 'transfer'].includes(type)) throw new Error('Tipo de movimentação inválido.');
  const cents = amount(input.amountCents);
  const date = dateValue(input.date || today());
  const description = String(input.description || '').trim();
  if (!description || description.length > 120) throw new Error('A descrição precisa ter de 1 a 120 caracteres.');
  const account = activeAccount(state, input.accountId || state.accounts.find(item => item.isLiquid && item.status === 'active')?.id);
  const method = input.method || 'account';
  const card = method === 'card' ? state.cards.find(item => item.id === Number(input.cardId) && item.active) : null;
  if (method === 'card' && !card) throw new Error('Selecione um cartão de crédito cadastrado.');
  const defaultCategory = state.categories.find(item => item.name === (type === 'income' ? 'Salário' : 'Outros') && item.type === type)
    || state.categories.find(item => item.type === type);
  const selectedCategory = type === 'transfer' ? null : category(state, input.categoryId || defaultCategory?.id, type);
  let destination = null;
  if (type === 'transfer') {
    if (method !== 'transfer') throw new Error('Transferências precisam usar o método transferência.');
    destination = activeAccount(state, input.counterpartyAccountId);
    if (destination.id === account.id) throw new Error('Selecione duas contas diferentes para a transferência.');
  }
  const count = method === 'card' ? Number(input.installmentCount || 1) : 1;
  const parts = installments(cents, count);
  const group = count > 1 ? `installment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` : null;
  const firstDue = card ? monthDate(date <= monthDate(monthKey(date), card.closingDay) ? monthKey(date) : shiftMonth(monthKey(date), 1), card.dueDay) : date;
  const rows = parts.map((part, index) => {
    const dueDate = card ? monthDate(shiftMonth(monthKey(firstDue), index), card.dueDay) : date;
    const row = {
      id: state.nextId++, description, normalizedMerchant: normalizeMerchant(description, state.merchantRules), type,
      amountCents: part, date, dueDate, purchaseDate: date, method,
      status: card ? 'pending' : date <= today() ? 'paid' : 'planned',
      source: card ? 'card' : extra.source || 'manual', installmentGroup: group,
      installmentNumber: count > 1 ? index + 1 : 0, installmentCount: count,
      accountId: type === 'income' || type === 'transfer' || method !== 'card' ? account.id : card.accountId || account.id,
      counterpartyAccountId: destination?.id || null, categoryId: selectedCategory?.id || null,
      cardId: card?.id || null, recurrenceId: extra.recurrenceId || null, incomeSourceId: extra.incomeSourceId || null,
      shoppingImportId: extra.shoppingImportId || null,
      spendingContext: type === 'expense' && ['routine', 'extra'].includes(input.spendingContext) ? input.spendingContext : undefined,
      memo: String(input.memo || '').slice(0, 500), deletedAt: null, paidAt: null
    };
    state.transactions.push(row);
    return row;
  });
  recordAudit(state, 'create', 'transaction', group || rows[0].id, null, rows);
  return { items: rows.map(row => flatTransaction(row, state)), installmentGroup: group };
}

function flatTransaction(row, state) {
  const selectedCategory = state.categories.find(item => item.id === row.categoryId);
  const selectedAccount = state.accounts.find(item => item.id === row.accountId);
  const selectedCard = state.cards.find(item => item.id === row.cardId);
  return { ...row, category: selectedCategory?.name || 'Outros', categoryId: selectedCategory?.id || null, accountName: selectedAccount?.name || '', cardName: selectedCard?.name || '' };
}

function flatSchedule(state, row) {
  return { ...row, category: state.categories.find(item => item.id === row.categoryId) || null, account: state.accounts.find(item => item.id === row.accountId) || null, card: state.cards.find(item => item.id === row.cardId) || null };
}

function advanceScheduleDate(value, frequency, dayOfMonth) {
  const date = new Date(`${value}T00:00:00Z`);
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === 'fortnightly') date.setUTCDate(date.getUTCDate() + 14);
  else if (frequency === 'yearly') return monthDate(`${date.getUTCFullYear() + 1}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`, dayOfMonth || date.getUTCDate());
  else return monthDate(shiftMonth(monthKey(value), 1), dayOfMonth || date.getUTCDate());
  return date.toISOString().slice(0, 10);
}

function createSchedule(state, key, input) {
  const cents = amount(input.amountCents);
  const name = String(input.name || '').trim();
  if (!name || name.length > 90) throw new Error('Informe um nome com até 90 caracteres.');
  const frequency = input.frequency || 'monthly';
  if (!['weekly', 'fortnightly', 'monthly', 'yearly', 'once'].includes(frequency)) throw new Error('Frequência inválida.');
  const date = dateValue(input.startDate || input.nextDate || today());
  const item = {
    id: state.nextId++, name, amountCents: cents, frequency,
    dayOfMonth: Number(input.dayOfMonth || date.slice(8, 10)), startDate: date,
    nextDate: date, endDate: input.endDate ? dateValue(input.endDate) : null,
    reminderDaysBefore: Number(input.reminderDaysBefore || 0), alertEnabled: input.alertEnabled !== false,
    method: input.method || 'account', active: input.active !== false,
    categoryId: input.categoryId ? category(state, input.categoryId).id : state.categories.find(row => row.name === 'Outros')?.id,
    accountId: activeAccount(state, input.accountId || state.accounts.find(row => row.isLiquid && row.status === 'active')?.id).id,
    cardId: input.cardId ? Number(input.cardId) : null
  };
  if (key === 'recurrences' && frequency === 'once') item.frequency = 'monthly';
  state[key].push(item);
  recordAudit(state, 'create', key === 'recurrences' ? 'recurrence' : 'income-source', item.id, null, item);
  return flatSchedule(state, item);
}

function shoppingTotal(list) {
  return (list.items || []).filter(item => item.status === 'purchased' && item.paidCents > 0)
    .reduce((total, item) => total + Math.round(item.paidCents * item.quantityMilli / 1000), 0);
}

function validateShoppingState(input, previous) {
  if (!Array.isArray(input.lists) || input.lists.length > 120 || !Array.isArray(input.stock) || input.stock.length > 4000) throw new Error('A lista de compras ultrapassou o limite permitido.');
  const listIds = new Set();
  let totalItems = 0;
  const prior = new Map(previous.lists.map(item => [item.id, item]));
  const lists = input.lists.map(list => {
    if (!['market', 'pharmacy', 'other'].includes(list.kind) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(list.month || ''))) throw new Error('Tipo ou mês de lista inválido.');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(list.id || '')) || listIds.has(list.id)) throw new Error('Identificador de lista inválido ou repetido.');
    listIds.add(list.id);
    if (!Array.isArray(list.items)) throw new Error('Itens da lista inválidos.');
    totalItems += list.items.length;
    if (totalItems > 4000) throw new Error('A lista ultrapassou o limite local de itens.');
    const old = prior.get(list.id);
    const fingerprint = value => JSON.stringify({ id: value.id, month: value.month, kind: value.kind, name: value.name, status: value.status, items: (value.items || []).map(item => ({ id: item.id, name: item.name, section: item.section, quantityMilli: item.quantityMilli, unit: item.unit, estimatedCents: item.estimatedCents, paidCents: item.paidCents, status: item.status, addedToStock: item.addedToStock === true })) });
    if (old?.financialTransactionId && fingerprint(list) !== fingerprint(old)) throw new Error('Esta lista já foi contabilizada e não pode ser alterada.');
    const itemIds = new Set();
    return {
      ...list, status: list.status === 'completed' ? 'completed' : 'open',
      financialTransactionId: old?.financialTransactionId || null,
      items: list.items.map(item => {
        if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(item.id || '')) || itemIds.has(item.id)) throw new Error('Identificador de item inválido ou repetido.');
        itemIds.add(item.id);
        if (!['planned', 'purchased', 'not-found', 'buy-elsewhere', 'postponed'].includes(item.status || 'planned')) throw new Error('Situação de item inválida.');
        if (!['un', 'kg', 'g', 'l', 'ml', 'pack'].includes(item.unit || 'un')) throw new Error('Unidade de item inválida.');
        const quantityMilli = Number(item.quantityMilli ?? 1000);
        const estimatedCents = Number(item.estimatedCents ?? 0);
        const paidCents = Number(item.paidCents ?? 0);
        if (!Number.isSafeInteger(quantityMilli) || quantityMilli < 1 || quantityMilli > 1000000 || !Number.isSafeInteger(estimatedCents) || estimatedCents < 0 || !Number.isSafeInteger(paidCents) || paidCents < 0) throw new Error('Quantidade ou valor de item inválido.');
        if (!String(item.name || '').trim() || !String(item.section || 'Outros').trim()) throw new Error('Informe nome e seção para cada item.');
        return { ...item, name: String(item.name).trim().slice(0, 100), section: String(item.section || 'Outros').trim().slice(0, 60), quantityMilli, estimatedCents, paidCents, unit: item.unit || 'un', status: item.status || 'planned', addedToStock: item.addedToStock === true };
      })
    };
  });
  for (const old of previous.lists) if (old.financialTransactionId && !listIds.has(old.id)) throw new Error('Uma lista contabilizada não pode ser removida do histórico.');
  const stockIds = new Set();
  const stock = input.stock.map(item => {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(item.id || '')) || stockIds.has(item.id)) throw new Error('Identificador de estoque inválido ou repetido.');
    stockIds.add(item.id);
    if (!['un', 'kg', 'g', 'l', 'ml', 'pack'].includes(item.unit || 'un')) throw new Error('Unidade de estoque inválida.');
    const quantityMilli = Number(item.quantityMilli ?? 1000);
    if (!Number.isSafeInteger(quantityMilli) || quantityMilli < 1 || quantityMilli > 1000000) throw new Error('Quantidade de estoque inválida.');
    return { ...item, quantityMilli, unit: item.unit || 'un', name: String(item.name || '').trim().slice(0, 100), section: String(item.section || 'Outros').trim().slice(0, 60) };
  });
  return { lists, stock };
}

function backupRelation(source, field) {
  const value = source[field] ?? source[`${field}Id`];
  return value && typeof value === 'object' ? value.id : value;
}

function backupRecordKey(type, row) {
  if (type === 'account') return row.name;
  if (type === 'category') return `${row.type}|${row.name}`;
  if (type === 'card') return `${row.name}|${row.lastFour || ''}`;
  if (type === 'recurrence' || type === 'income-source' || type === 'goal') return row.name;
  if (type === 'reserve') return row.kind;
  if (type === 'budget') return `${row.month}|${row.categoryName || row.category?.name || ''}`;
  if (type === 'preference' || type === 'shopping-state') return 'primary';
  if (type === 'month-close') return row.month;
  if (type === 'merchant-rule') return `${row.normalizedAlias || row.alias}|${row.canonicalName}`;
  if (type === 'desired-purchase') return `${row.name}|${row.status}`;
  return duplicateKey({ ...row, date: row.date || row.purchaseDate });
}

function restoreMobileBackup(state, input) {
  if (input?.schemaVersion !== 1 || input?.application !== 'Xitolinos Planejamento' || !input.records || typeof input.records !== 'object') throw new Error('Este arquivo não é um backup compatível do Xitolinos.');
  if (JSON.stringify(input).length > 25_000_000) throw new Error('O backup excede o limite local de 25 MB.');
  const types = ['account', 'category', 'card', 'recurrence', 'income-source', 'reserve', 'goal', 'budget', 'preference', 'month-close', 'merchant-rule', 'desired-purchase', 'shopping-state', 'transaction'];
  for (const name of types) if (input.records[name] !== undefined && (!Array.isArray(input.records[name]) || input.records[name].length > 10000)) throw new Error(`A lista ${name} não é válida ou ultrapassa 10.000 registros.`);
  const paths = { account: 'accounts', category: 'categories', card: 'cards', recurrence: 'recurrences', 'income-source': 'incomeSources', reserve: 'reserves', goal: 'goals', budget: 'budgets', 'month-close': 'monthCloses', 'merchant-rule': 'merchantRules', 'desired-purchase': 'desiredPurchases', transaction: 'transactions' };
  const maps = Object.fromEntries(types.map(name => [name, new Map()]));
  const counts = Object.fromEntries(types.map(name => [name, 0]));
  const getRows = type => type === 'preference' ? [state.preferences] : type === 'shopping-state' ? [] : (state[paths[type]] || []);
  const getId = row => row?.id ?? 'primary';
  for (const type of types) {
    if (type === 'shopping-state' || type === 'preference') continue;
    const incoming = input.records[type] || [];
    const existing = new Map(getRows(type).map(row => [backupRecordKey(type, row), row]));
    for (const source of incoming) {
      const local = existing.get(backupRecordKey(type, source));
      if (local) maps[type].set(String(getId(source)), local.id ?? 'primary');
    }
  }
  const insert = (type, source, data) => {
    const oldId = String(getId(source));
    if (!source || source.id == null && type !== 'preference' && type !== 'shopping-state') throw new Error(`Um registro de ${type} está sem identificador de origem.`);
    if (maps[type].has(oldId)) return maps[type].get(oldId);
    const id = type === 'preference' ? 'primary' : state.nextId++;
    const row = { ...data, id };
    if (type === 'preference') state.preferences = { ...state.preferences, ...data };
    else if (type !== 'shopping-state') (state[paths[type]] ||= []).push(row);
    maps[type].set(oldId, id);
    counts[type] += 1;
    return id;
  };
  const relationId = (type, source, field) => {
    const value = backupRelation(source, field);
    if (value == null) return null;
    return maps[type].get(String(value)) ?? null;
  };

  for (const source of input.records.account || []) {
    insert('account', source, { ...source, id: undefined, status: source.status || 'active', openingBalanceCents: Number(source.openingBalanceCents || 0) });
  }
  for (const source of input.records.category || []) {
    insert('category', source, { ...source, id: undefined, status: source.status || 'active' });
  }
  for (const source of input.records.card || []) insert('card', source, { ...source, id: undefined, accountId: relationId('account', source, 'account'), active: source.active !== false });
  for (const source of input.records.recurrence || []) insert('recurrence', source, { ...source, id: undefined, accountId: relationId('account', source, 'account'), categoryId: relationId('category', source, 'category'), cardId: relationId('card', source, 'card') });
  for (const source of input.records['income-source'] || []) insert('income-source', source, { ...source, id: undefined, accountId: relationId('account', source, 'account'), categoryId: relationId('category', source, 'category') });
  for (const source of input.records.reserve || []) insert('reserve', source, { ...source, id: undefined, accountId: relationId('account', source, 'account') });
  for (const source of input.records.goal || []) insert('goal', source, { ...source, id: undefined });
  for (const source of input.records.budget || []) insert('budget', source, { ...source, id: undefined, categoryId: relationId('category', source, 'category'), categoryName: source.categoryName || state.categories.find(row => row.id === relationId('category', source, 'category'))?.name || '' });
  for (const source of input.records.preference || []) {
    const { androidBiometricEnabled: ignored, ...safe } = source;
    insert('preference', source, safe);
  }
  for (const source of input.records['month-close'] || []) insert('month-close', source, { ...source, id: undefined });
  for (const source of input.records['merchant-rule'] || []) insert('merchant-rule', source, { ...source, id: undefined, categoryId: relationId('category', source, 'category') });
  for (const source of input.records['desired-purchase'] || []) insert('desired-purchase', source, { ...source, id: undefined, categoryId: relationId('category', source, 'category') });

  const listIdMap = new Map();
  for (const sourceState of input.records['shopping-state'] || []) {
    const incoming = validateShoppingState({ lists: sourceState.lists || [], stock: sourceState.stock || [] }, { lists: [], stock: [] });
    const existingLists = new Map(state.shoppingState.lists.map(row => [`${row.month}|${row.kind}|${row.name}`, row]));
    for (const list of incoming.lists) {
      const key = `${list.month}|${list.kind}|${list.name}`;
      const local = existingLists.get(key);
      if (local) { listIdMap.set(String(list.id), local.id); continue; }
      if (state.shoppingState.lists.some(row => row.id === list.id)) list.id = `list-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
      listIdMap.set(String(sourceState.lists.find(row => `${row.month}|${row.kind}|${row.name}` === key)?.id || list.id), list.id);
      list.financialTransactionId = null;
      state.shoppingState.lists.push(list);
      existingLists.set(key, list);
      counts['shopping-state'] += 1;
    }
    for (const item of incoming.stock) {
      if (state.shoppingState.stock.some(row => row.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR'))) continue;
      state.shoppingState.stock.push(item);
      counts['shopping-state'] += 1;
    }
  }

  const transactionRows = input.records.transaction || [];
  for (const source of transactionRows) {
    const key = duplicateKey({ ...source, date: source.date || source.purchaseDate });
    const local = state.transactions.find(row => row.status !== 'voided' && duplicateKey(flatTransaction(row, state)) === key);
    if (local) { maps.transaction.set(String(source.id), local.id); continue; }
    const type = ['income', 'expense', 'transfer'].includes(source.type) ? source.type : 'expense';
    const item = {
      ...source,
      id: state.nextId++, type, amountCents: amount(source.amountCents), date: dateValue(source.date || source.purchaseDate),
      accountId: relationId('account', source, 'account') || state.accounts.find(row => row.isLiquid && row.status === 'active')?.id,
      counterpartyAccountId: relationId('account', source, 'counterpartyAccount'),
      categoryId: relationId('category', source, 'category'), cardId: relationId('card', source, 'card'),
      recurrenceId: relationId('recurrence', source, 'recurrence'), incomeSourceId: relationId('income-source', source, 'incomeSource'),
      shoppingImportId: listIdMap.get(String(source.shoppingImportId || '')) || source.shoppingImportId || null,
      deletedAt: source.deletedAt || null, paidAt: source.paidAt || null
    };
    for (const field of ['account', 'counterpartyAccount', 'category', 'card', 'recurrence', 'incomeSource', 'accountId', 'categoryId', 'cardId']) delete item[field];
    item.accountId = relationId('account', source, 'account') || state.accounts.find(row => row.isLiquid && row.status === 'active')?.id;
    item.counterpartyAccountId = relationId('account', source, 'counterpartyAccount');
    item.categoryId = relationId('category', source, 'category');
    item.cardId = relationId('card', source, 'card');
    item.recurrenceId = relationId('recurrence', source, 'recurrence');
    item.incomeSourceId = relationId('income-source', source, 'incomeSource');
    state.transactions.push(item);
    maps.transaction.set(String(source.id), item.id);
    counts.transaction += 1;
  }
  for (const [sourceId, localId] of listIdMap) {
    const sourceList = (input.records['shopping-state'] || []).flatMap(item => item.lists || []).find(item => String(item.id) === sourceId);
    const linkedId = sourceList?.financialTransactionId && maps.transaction.get(String(sourceList.financialTransactionId));
    const localList = state.shoppingState.lists.find(item => String(item.id) === String(localId));
    if (localList && linkedId) localList.financialTransactionId = linkedId;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  recordAudit(state, 'restore', 'backup', new Date().toISOString(), null, { importedCount: total, counts });
  return { importedCount: total, counts, message: `${total} registros novos foram adicionados. Os itens que já existiam neste aparelho foram preservados.` };
}

async function currentState() {
  const state = await readMobileState();
  if (!state) throw new Error('Os dados locais não foram iniciados. Saia e entre novamente.');
  return state;
}

export async function login(identifier, password) {
  const email = String(identifier || '').trim().toLocaleLowerCase('pt-BR');
  const inputPassword = String(password || '');
  let state = await readMobileState();
  if (!state) state = createInitialMobileState();
  const user = state.users.find(item => item.email.toLocaleLowerCase('pt-BR') === email);
  const knownDemo = Object.values(DEMO_CREDENTIALS).some(item => item.email === email && item.password === inputPassword);
  if (!user || (!user.passwordDigest && !knownDemo)) throw new Error('Confira o usuário e a senha.');
  if (!user.passwordDigest) {
    user.passwordSalt = makeSalt();
    user.passwordDigest = await passwordDigest(inputPassword, user.passwordSalt);
    await writeMobileState(state);
  } else if (await passwordDigest(inputPassword, user.passwordSalt) !== user.passwordDigest) {
    throw new Error('Confira o usuário e a senha.');
  }
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, '0')).join('');
  state.sessions = (state.sessions || []).filter(item => item.expiresAt > Date.now());
  state.sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  await writeMobileState(state);
  return { token, user: { id: user.id, username: user.username, email: user.email, profile: user.profile } };
}

export async function api(path, options = {}) {
  const state = await currentState();
  const user = getSession(state, options.token);
  const method = String(options.method || 'GET').toUpperCase();
  const body = decodeBody(options.body);
  const url = new URL(path, 'https://localhost');
  const pathname = url.pathname;
  const shoppingViewer = user.profile === 'shopping_viewer';
  if (shoppingViewer && !(method === 'GET' && pathname === '/finance/shopping')) throw new Error('Este perfil só pode consultar a lista de compras compartilhada.');
  if (method !== 'GET') requireOwner(user);

  if (pathname === '/finance/security/status' && method === 'GET') return { enabled: state.preferences.androidBiometricEnabled === true, credentialCount: state.preferences.androidBiometricEnabled ? 1 : 0, credentials: state.preferences.androidBiometricEnabled ? [{ id: 'android-device', deviceName: 'Este aparelho' }] : [], localOnly: true, nativeBiometric: true };
  if (pathname === '/finance/security/registration/options' && method === 'GET') return { nativeBiometric: true, localOnly: true };
  if (pathname === '/finance/security/registration/verify' && method === 'POST') {
    if (body.native !== true) throw new Error('Cadastre a biometria pela tela segura do Android.');
    state.preferences.androidBiometricEnabled = true;
    recordAudit(state, 'enable-biometric', 'security', user.id, null, { nativeBiometric: true });
    await writeMobileState(state);
    return { credentialCount: 1, message: 'Biometria ativada neste aparelho.' };
  }
  if (pathname === '/finance/security/credential/remove' && method === 'POST') {
    const storedUser = state.users.find(item => item.id === user.id);
    if (!storedUser?.passwordDigest || await passwordDigest(String(body.password || ''), storedUser.passwordSalt) !== storedUser.passwordDigest) throw new Error('A senha da conta está incorreta.');
    state.preferences.androidBiometricEnabled = false;
    recordAudit(state, 'remove-biometric', 'security', user.id, { nativeBiometric: true }, null);
    await writeMobileState(state);
    return { credentialCount: 0 };
  }
  if (pathname.startsWith('/finance/security/')) throw new Error('A opção de segurança solicitada não existe neste aparelho.');
  if (pathname === '/finance/billing') return { mode: 'local', checkoutReady: false, manageReady: false, subscription: { plan: 'local', status: 'local' }, message: 'A cobrança fica desligada no aplicativo local e offline.' };
  if (pathname === '/finance/dashboard' && method === 'GET') {
    const dashboard = buildMobileDashboard(state, url.searchParams.get('month'));
    const totals = { ...dashboard.totals };
    delete totals.expenses;
    delete totals.incomes;
    return { ...dashboard, totals, profile: { username: user.username, email: user.email, profile: user.profile } };
  }
  if (pathname === '/finance/accounts' && method === 'GET') return { items: state.accounts };
  if (pathname === '/finance/categories' && method === 'GET') return { items: state.categories };
  if (pathname === '/finance/recurrences' && method === 'GET') return { items: state.recurrences.map(item => flatSchedule(state, item)) };
  if (pathname === '/finance/incomes' && method === 'GET') return { items: state.incomeSources.map(item => flatSchedule(state, item)) };
  if (pathname === '/finance/cards' && method === 'GET') return { items: state.cards.map(item => flatSchedule(state, item)) };
  if (pathname === '/finance/reserves' && method === 'GET') return { items: state.reserves.map(item => flatSchedule(state, item)) };
  if (pathname === '/finance/goals' && method === 'GET') return { items: state.goals };
  if (pathname === '/finance/budgets' && method === 'GET') return { items: state.budgets };
  if (pathname === '/finance/preferences' && method === 'GET') return { item: state.preferences };
  if (pathname === '/finance/shopping' && method === 'GET') {
    if (shoppingViewer && !(state.shoppingState.sharedViewerIds || []).some(id => String(id) === String(user.id))) throw new Error('A lista de compras não foi compartilhada com este perfil.');
    return { lists: state.shoppingState.lists, stock: state.shoppingState.stock };
  }
  if (pathname === '/finance/audit' && method === 'GET') return { items: state.auditEvents.slice(0, 100) };

  if (pathname === '/finance/preferences' && method === 'PUT') {
    const allowed = ['theme', 'accent', 'minimumReserveCents', 'cardStopDaysBefore', 'closeoutDay', 'avatarDataUrl'];
    const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    state.preferences = {
      ...state.preferences, ...patch,
      minimumReserveCents: Math.max(0, Number(body.minimumReserveCents ?? state.preferences.minimumReserveCents ?? 0)),
      cardStopDaysBefore: Math.max(0, Math.min(15, Number(body.cardStopDaysBefore ?? 3))),
      closeoutDay: Math.max(1, Math.min(28, Number(body.closeoutDay ?? 1)))
    };
    recordAudit(state, 'preferences', 'preference', 1, null, { ...state.preferences, avatarDataUrl: state.preferences.avatarDataUrl ? '[imagem]' : '' });
    await writeMobileState(state);
    return { item: state.preferences };
  }
  if (pathname === '/finance/shopping' && method === 'PUT') {
    const next = validateShoppingState(body, state.shoppingState);
    state.shoppingState = { ...state.shoppingState, ...next };
    recordAudit(state, 'update', 'shopping-state', 1, null, { listCount: next.lists.length, stockCount: next.stock.length });
    await writeMobileState(state);
    return next;
  }
  if (pathname === '/finance/transactions' && method === 'POST') {
    const result = createTransaction(state, body);
    await writeMobileState(state);
    return result;
  }
  if (pathname === '/finance/recurrences' && method === 'POST') {
    const item = createSchedule(state, 'recurrences', body);
    await writeMobileState(state);
    return { item };
  }
  if (pathname === '/finance/incomes' && method === 'POST') {
    const item = createSchedule(state, 'incomeSources', body);
    await writeMobileState(state);
    return { item };
  }
  if (pathname === '/finance/accounts' && method === 'POST') {
    const name = String(body.name || '').trim();
    if (!name || name.length > 60) throw new Error('Informe o nome da conta.');
    const item = { id: state.nextId++, name, institution: String(body.institution || '').slice(0, 60), type: body.type || 'checking', openingBalanceCents: Number(body.openingBalanceCents || 0), isLiquid: body.isLiquid !== false, status: 'active' };
    state.accounts.push(item); recordAudit(state, 'create', 'account', item.id, null, item); await writeMobileState(state); return { item };
  }
  if (pathname === '/finance/categories' && method === 'POST') {
    const name = String(body.name || '').trim();
    if (!name || name.length > 50) throw new Error('Informe o nome da categoria.');
    if (state.categories.some(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error('Já existe uma categoria com esse nome.');
    const item = { id: state.nextId++, name, type: body.type || 'expense', status: 'active' }; state.categories.push(item); recordAudit(state, 'create', 'category', item.id, null, item); await writeMobileState(state); return { item };
  }

  const transactionMatch = pathname.match(/^\/finance\/transactions\/(\d+)(?:\/(delete|restore))?$/);
  if (transactionMatch && method === 'PUT') {
    const row = state.transactions.find(item => item.id === Number(transactionMatch[1]) && !item.deletedAt);
    if (!row) throw new Error('Lançamento não encontrado.');
    const previous = { ...row };
    if (body.description !== undefined) row.description = String(body.description).trim().slice(0, 120);
    if (body.amountCents !== undefined) row.amountCents = amount(body.amountCents);
    if (body.date !== undefined) row.date = dateValue(body.date);
    if (body.categoryId !== undefined) row.categoryId = category(state, body.categoryId, row.type).id;
    if (body.status && ['paid', 'pending', 'planned'].includes(body.status)) row.status = body.status;
    if (body.spendingContext !== undefined) {
      if (row.type !== 'expense' || !['routine', 'extra'].includes(body.spendingContext)) throw new Error('Classificação de despesa inválida.');
      row.spendingContext = body.spendingContext;
    }
    if (body.memo !== undefined) row.memo = String(body.memo).slice(0, 500);
    recordAudit(state, 'update', 'transaction', row.id, previous, row); await writeMobileState(state); return { item: flatTransaction(row, state) };
  }
  if (transactionMatch && method === 'POST' && transactionMatch[2]) {
    const row = state.transactions.find(item => item.id === Number(transactionMatch[1]));
    if (!row) throw new Error('Lançamento não encontrado.');
    const previous = { ...row };
    if (transactionMatch[2] === 'delete') { row.status = 'voided'; row.deletedAt = new Date().toISOString(); }
    else { row.status = row.date <= today() ? 'paid' : 'planned'; row.deletedAt = null; }
    recordAudit(state, transactionMatch[2], 'transaction', row.id, previous, row); await writeMobileState(state); return { item: flatTransaction(row, state) };
  }

  const settleInstallments = pathname.match(/^\/finance\/installments\/([A-Za-z0-9_-]+)\/settle$/);
  if (settleInstallments && method === 'POST') {
    const group = settleInstallments[1];
    const paidAmountCents = amount(body.paidAmountCents);
    const rows = state.transactions.filter(item => item.installmentGroup === group && item.status !== 'voided');
    if (!rows.length) throw new Error('Parcelamento não encontrado.');
    const remaining = rows.filter(item => item.status !== 'paid');
    for (const row of remaining) { row.status = 'voided'; row.deletedAt = new Date().toISOString(); }
    const result = createTransaction(state, {
      description: `Quitação: ${rows[0].description}`, type: 'expense', amountCents: paidAmountCents,
      date: today(), method: 'account', categoryId: rows[0].categoryId, accountId: rows[0].accountId
    });
    recordAudit(state, 'settle-installments', 'transaction', group, rows, { paidAmountCents, canceledCount: remaining.length });
    await writeMobileState(state);
    return { items: result.items, canceledCount: remaining.length };
  }

  const cardSettle = pathname.match(/^\/finance\/cards\/(\d+)\/settle$/);
  if (cardSettle && method === 'POST') {
    const card = state.cards.find(item => item.id === Number(cardSettle[1]));
    const month = validMonth(body.month);
    if (!card) throw new Error('Cartão não encontrado.');
    const rows = state.transactions.filter(item => item.cardId === card.id && item.type === 'expense' && item.status !== 'voided' && item.status !== 'paid' && monthKey(item.dueDate || item.date) === month);
    for (const row of rows) { row.status = 'paid'; row.paidAt = today(); row.accountId = card.accountId || row.accountId; }
    recordAudit(state, 'settle-invoice', 'card', card.id, { month, count: rows.length }, { month, paidCents: rows.reduce((sum, row) => sum + row.amountCents, 0) });
    await writeMobileState(state); return { paidCount: rows.length, paidCents: rows.reduce((sum, row) => sum + row.amountCents, 0) };
  }
  if (pathname === '/finance/cards' && method === 'POST') {
    const closingDay = Number(body.closingDay); const dueDay = Number(body.dueDay);
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error('Fechamento e vencimento precisam ser dias entre 1 e 31.');
    const item = { id: state.nextId++, name: String(body.name || 'Cartão').trim().slice(0, 60), network: String(body.network || '').slice(0, 30), lastFour: String(body.lastFour || '').slice(-4), closingDay, dueDay, limitCents: Number(body.limitCents || 0), accountId: activeAccount(state, body.accountId || state.accounts.find(row => row.isLiquid && row.status === 'active')?.id).id, active: true };
    state.cards.push(item); recordAudit(state, 'create', 'card', item.id, null, item); await writeMobileState(state); return { item: flatSchedule(state, item) };
  }

  const recurrenceDone = pathname.match(/^\/finance\/recurrences\/(\d+)\/complete$/);
  if (recurrenceDone && method === 'POST') {
    const item = state.recurrences.find(row => row.id === Number(recurrenceDone[1]));
    if (!item) throw new Error('Despesa recorrente não encontrada.');
    const date = dateValue(body.date || today());
    if (state.transactions.some(row => row.recurrenceId === item.id && (row.dueDate || row.date) === date && row.status !== 'voided')) throw new Error('Esta despesa já foi contabilizada nessa data.');
    const result = createTransaction(state, { description: item.name, type: 'expense', amountCents: item.amountCents, date, method: item.method, accountId: item.accountId, cardId: item.cardId, categoryId: item.categoryId }, { recurrenceId: item.id });
    await writeMobileState(state); return { item: result.items[0] };
  }
  const incomeReceive = pathname.match(/^\/finance\/incomes\/(\d+)\/receive$/);
  if (incomeReceive && method === 'POST') {
    const item = state.incomeSources.find(row => row.id === Number(incomeReceive[1]) && row.active);
    if (!item) throw new Error('Recebimento não encontrado ou inativo.');
    const date = dateValue(body.date || today());
    const result = createTransaction(state, { description: item.name, type: 'income', amountCents: item.amountCents, date, method: 'account', accountId: item.accountId, categoryId: item.categoryId }, { incomeSourceId: item.id });
    if (item.frequency !== 'once') {
      item.nextDate = advanceScheduleDate(item.nextDate, item.frequency, item.dayOfMonth);
    } else item.active = false;
    recordAudit(state, 'receive', 'income-source', item.id, null, { receivedDate: date }); await writeMobileState(state); return { item: flatSchedule(state, item) };
  }

  const reserveMove = pathname.match(/^\/finance\/reserves\/(\d+)\/movement$/);
  if (reserveMove && method === 'POST') {
    const reserve = state.reserves.find(item => item.id === Number(reserveMove[1]));
    if (!reserve) throw new Error('Reserva não encontrada.');
    const cents = amount(body.amountCents); const direction = body.direction;
    if (body.confirmed !== true) throw new Error('Confirme a movimentação para atualizar o saldo da reserva.');
    if (!['deposit', 'withdraw'].includes(direction)) throw new Error('Tipo de movimentação inválido.');
    const next = reserve.balanceCents + (direction === 'deposit' ? cents : -cents);
    if (next < 0) throw new Error('Saldo insuficiente nesta reserva.');
    const cash = activeAccount(state, state.accounts.find(item => item.isLiquid && item.status === 'active')?.id);
    const reserveAccount = activeAccount(state, reserve.accountId);
    if (reserveAccount.id === cash.id) throw new Error('Associe esta reserva a uma conta diferente da conta do dia a dia.');
    const transfer = createTransaction(state, {
      description: `${direction === 'deposit' ? 'Aporte em' : 'Resgate de'} ${reserve.name}`, type: 'transfer', amountCents: cents,
      date: today(), method: 'transfer', accountId: direction === 'deposit' ? cash.id : reserveAccount.id,
      counterpartyAccountId: direction === 'deposit' ? reserveAccount.id : cash.id
    });
    const previous = { ...reserve };
    reserve.balanceCents = next;
    recordAudit(state, `reserve-${direction}`, 'reserve', reserve.id, previous, reserve);
    await writeMobileState(state);
    return { item: reserve, transfer: transfer.items[0] };
  }
  if (pathname === '/finance/reserves' && method === 'POST') {
    const kind = body.kind || 'savings';
    if (!['emergency', 'savings', 'investment'].includes(kind)) throw new Error('Tipo de reserva inválido.');
    const current = state.reserves.find(row => row.kind === kind);
    const existingAccount = current?.accountId ? state.accounts.find(row => row.id === current.accountId) : null;
    const openingBalance = Math.max(0, Number(body.balanceCents ?? current?.balanceCents ?? 0));
    const reserveName = String(body.name || current?.name || kind).trim().slice(0, 60);
    const account = existingAccount || state.accounts.find(row => row.name === reserveName && row.status !== 'archived') || {
      id: state.nextId++, name: reserveName, institution: 'Conta local', type: kind, openingBalanceCents: openingBalance, isLiquid: false, status: 'active'
    };
    if (!state.accounts.some(row => row.id === account.id)) state.accounts.push(account);
    const item = current || { id: state.nextId++, kind, balanceCents: openingBalance, accountId: account.id };
    if (!item.name) throw new Error('Informe o nome da reserva.');
    Object.assign(item, { name: reserveName, kind, balanceCents: openingBalance, targetCents: Math.max(0, Number(body.targetCents ?? current?.targetCents ?? 0)), annualYieldBasisPoints: Math.max(0, Number(body.annualYieldBasisPoints ?? current?.annualYieldBasisPoints ?? 0)), accountId: account.id });
    if (!current) state.reserves.push(item);
    recordAudit(state, current ? 'update' : 'create', 'reserve', item.id, current ? { ...current } : null, item);
    await writeMobileState(state);
    return { item };
  }
  if (pathname === '/finance/goals' && method === 'POST') {
    const name = String(body.name || '').trim(); const targetCents = amount(body.targetCents);
    if (!name || name.length > 90) throw new Error('Informe um nome para a meta.');
    const item = { id: state.nextId++, name, targetCents, savedCents: 0, dueDate: body.dueDate || null };
    state.goals.push(item); recordAudit(state, 'create', 'goal', item.id, null, item); await writeMobileState(state); return { item };
  }
  if (pathname === '/finance/decision' && method === 'POST') {
    const cents = amount(body.amountCents); const month = validMonth(body.month || today().slice(0, 7));
    const data = buildMobileDashboard(state, month);
    const requestedCategory = String(body.category || '').trim();
    const budget = data.budgets.find(item => normalizeMerchant(item.categoryName) === normalizeMerchant(requestedCategory));
    const categoryBudgetRemainderCents = budget ? Math.max(0, budget.limitCents - budget.usedCents) : null;
    const available = Math.max(0, data.totals.projectedEndBalanceCents - Number(data.preferences.minimumReserveCents || 0));
    const maximum = Math.min(available, categoryBudgetRemainderCents ?? available);
    const after = data.totals.projectedEndBalanceCents - cents;
    const minimum = Number(data.preferences.minimumReserveCents || 0);
    const recommended = cents <= maximum && after >= minimum;
    return { recommended, message: recommended ? `A compra cabe na projeção deste mês, preservando a margem mínima configurada.${budget ? ` Restam ${moneyText(categoryBudgetRemainderCents)} no limite de ${requestedCategory}.` : ''}` : budget && cents > categoryBudgetRemainderCents ? `Esse gasto passa ${moneyText(categoryBudgetRemainderCents)} disponíveis no limite de ${requestedCategory}.` : body.urgency === 'high' ? 'Mesmo sendo urgente, o valor deixaria o saldo abaixo da margem mínima configurada.' : 'A compra não é recomendada: a projeção ficaria abaixo dos compromissos e da margem de segurança.', amountCents: cents, projectedBeforeCents: data.totals.projectedEndBalanceCents, projectedAfterCents: after, minimumReserveCents: minimum, coverageNeededCents: Math.max(0, minimum - after), month, maximumRecommendedCents: maximum, categoryBudgetRemainderCents, countedExpenses: data.details.filter(row => row.type === 'expense').map(row => ({ description: row.description, amountCents: row.amountCents, date: row.dueDate || row.date, status: row.status })) };
  }

  if (pathname === '/finance/shopping/commit' && method === 'POST') {
    const month = validMonth(body.month); const list = state.shoppingState.lists.find(item => item.id === String(body.listId || '') && item.month === month);
    if (!list) throw new Error('Lista de compras não encontrada.');
    if (list.financialTransactionId) {
      const linked = state.transactions.find(item => item.id === list.financialTransactionId);
      if (linked) return { alreadyRecorded: true, amountCents: linked.amountCents, transaction: flatTransaction(linked, state) };
    }
    const cents = shoppingTotal(list);
    if (!cents) throw new Error('Informe o preço pago e marque ao menos um item comprado antes de registrar a despesa.');
    const row = createTransaction(state, { description: `Compras ${list.name}`.slice(0, 120), amountCents: cents, date: dateValue(body.date || today()), type: 'expense', method: body.method || 'account', accountId: body.accountId, categoryId: body.categoryId }, { source: 'shopping', shoppingImportId: list.id }).items[0];
    list.financialTransactionId = row.id;
    recordAudit(state, 'shopping-expense', 'transaction', row.id, null, { shoppingListId: list.id, amountCents: cents }); await writeMobileState(state);
    return { alreadyRecorded: false, amountCents: cents, transaction: row };
  }

  if (pathname === '/finance/month-close' && method === 'POST') {
    const month = validMonth(body.month);
    const current = state.monthCloses.find(item => item.month === month);
    const withdrawalFields = [['emergency', 'reserveWithdrawalCents'], ['savings', 'savingsWithdrawalCents'], ['investment', 'investmentWithdrawalCents']];
    const withdrawals = withdrawalFields.map(([kind, field]) => [kind, Number(body[field] || 0)]).filter(([, cents]) => cents > 0);
    if (withdrawals.length && body.confirmedWithdrawals !== true) throw new Error('Confirme que as retiradas aconteceram antes de atualizar as reservas.');
    for (const [kind, cents] of withdrawals) {
      amount(cents);
      const reserve = state.reserves.find(item => item.kind === kind);
      if (!reserve || cents > reserve.balanceCents) throw new Error('Saldo insuficiente na reserva selecionada.');
      const cash = activeAccount(state, state.accounts.find(item => item.isLiquid && item.status === 'active')?.id);
      const reserveAccount = activeAccount(state, reserve.accountId);
      if (reserveAccount.id === cash.id) throw new Error('Associe a reserva a uma conta diferente da conta do dia a dia.');
      createTransaction(state, { description: `Resgate no fechamento de ${month}`, type: 'transfer', method: 'transfer', date: today(), amountCents: cents, accountId: reserveAccount.id, counterpartyAccountId: cash.id });
      reserve.balanceCents -= cents;
    }
    if (body.cardPaid === true) {
      for (const row of state.transactions.filter(item => item.type === 'expense' && item.method === 'card' && item.status !== 'voided' && item.status !== 'paid' && monthKey(item.dueDate || item.date) === month)) { row.status = 'paid'; row.paidAt = today(); }
    }
    const item = { ...(current || {}), id: current?.id || state.nextId++, month, cardPaid: body.cardPaid === true, deficitCovered: body.deficitCovered === true, reserveWithdrawalCents: Number(body.reserveWithdrawalCents || 0), savingsWithdrawalCents: Number(body.savingsWithdrawalCents || 0), investmentWithdrawalCents: Number(body.investmentWithdrawalCents || 0), notes: String(body.notes || '').slice(0, 1000), confirmedAt: new Date().toISOString() };
    if (current) Object.assign(current, item); else state.monthCloses.push(item);
    recordAudit(state, 'close-month', 'month-close', item.id, current || null, item); await writeMobileState(state);
    return { item, dashboard: buildMobileDashboard(state, month) };
  }

  if (pathname === '/finance/import/rows' && method === 'POST') {
    if (!Array.isArray(body.rows) || body.rows.length > 2000) throw new Error('Selecione um arquivo com até 2.000 linhas.');
    const incoming = body.rows.map(row => ({ description: String(row.description || row.merchant || '').trim().slice(0, 120), date: dateValue(row.date), amountCents: amount(row.amountCents), type: row.type === 'income' ? 'income' : 'expense', method: ['pix', 'cash', 'debit', 'card', 'account'].includes(row.method) ? row.method : 'account', memo: String(row.memo || '').slice(0, 300) }));
    if (incoming.some(row => !row.description)) throw new Error('Algum item importado está sem descrição.');
    const inspected = classifyImportedRows(incoming, state.transactions.map(row => flatTransaction(row, state)));
    const added = [];
    for (const row of inspected.addNow) {
      const text = `${row.description} ${normalizeMerchant(row.description)}`.toLocaleLowerCase('pt-BR');
      const name = text.includes('farmac') ? 'Saúde' : /uber|combust|gasolina|posto/.test(text) ? 'Transporte' : /mercad|supermerc/.test(text) ? 'Mercado' : /restaur|sushi|ifood|hamburg|delivery/.test(text) ? 'Alimentação' : 'Outros';
      added.push(...createTransaction(state, { ...row, categoryId: state.categories.find(item => item.name === name && item.type === row.type)?.id || state.categories.find(item => item.name === 'Outros')?.id }, { source: 'import' }).items);
    }
    const batch = { id: state.nextId++, fileName: String(body.fileName || 'importação').slice(0, 180), status: inspected.review.length ? 'review' : 'completed', duplicateCount: inspected.duplicates.length, acceptedCount: added.length };
    state.importBatches.push(batch); recordAudit(state, 'import', 'import-batch', batch.id, null, { duplicateCount: inspected.duplicates.length, acceptedCount: added.length, reviewCount: inspected.review.length }); await writeMobileState(state);
    return { batchId: batch.id, added, duplicates: inspected.duplicates, review: inspected.review, latestDate: inspected.latestDate };
  }
  if (pathname === '/finance/import/confirm' && method === 'POST') {
    if (!Array.isArray(body.rows) || body.rows.length > 2000) throw new Error('Selecione as linhas para importar.');
    const created = [];
    for (const row of body.rows) {
      const candidate = { description: String(row.description || '').trim().slice(0, 120), date: dateValue(row.date), amountCents: amount(row.amountCents), type: row.type === 'income' ? 'income' : 'expense', method: ['pix', 'cash', 'debit', 'card', 'account'].includes(row.method) ? row.method : 'account' };
      if (!candidate.description || state.transactions.some(item => item.status !== 'voided' && duplicateKey(flatTransaction(item, state)) === duplicateKey(candidate))) continue;
      const name = `${candidate.description}`.toLocaleLowerCase('pt-BR').includes('farmac') ? 'Saúde' : 'Outros';
      created.push(...createTransaction(state, { ...candidate, categoryId: state.categories.find(item => item.name === name && item.type === candidate.type)?.id || state.categories.find(item => item.name === 'Outros')?.id }, { source: 'import' }).items);
    }
    if (body.batchId) { const batch = state.importBatches.find(item => item.id === Number(body.batchId)); if (batch) { batch.status = 'completed'; batch.acceptedCount += created.length; } }
    await writeMobileState(state); return { items: created, count: created.length };
  }

  if (pathname === '/finance/export' && method === 'GET') {
    const format = url.searchParams.get('format');
    if (format === 'backup') {
      const relation = (row, field) => row[`${field}Id`] ?? null;
      const { androidBiometricEnabled: ignored, ...safePreferences } = state.preferences;
      const records = {
        account: state.accounts.map(({ id, ...row }) => ({ id, ...row })),
        category: state.categories, card: state.cards.map(row => ({ ...row, account: relation(row, 'account') })),
        recurrence: state.recurrences.map(row => ({ ...row, category: relation(row, 'category'), account: relation(row, 'account'), card: relation(row, 'card') })),
        'income-source': state.incomeSources.map(row => ({ ...row, category: relation(row, 'category'), account: relation(row, 'account') })),
        reserve: state.reserves.map(row => ({ ...row, account: relation(row, 'account') })), goal: state.goals, budget: state.budgets.map(row => ({ ...row, category: relation(row, 'category') })),
        preference: [safePreferences], 'month-close': state.monthCloses, 'merchant-rule': state.merchantRules,
        'desired-purchase': state.desiredPurchases || [], 'shopping-state': [{ lists: state.shoppingState.lists, stock: state.shoppingState.stock }],
        transaction: state.transactions.map(row => ({ ...row, account: relation(row, 'account'), counterpartyAccount: relation(row, 'counterpartyAccount'), category: relation(row, 'category'), card: relation(row, 'card'), recurrence: relation(row, 'recurrence'), incomeSource: relation(row, 'incomeSource') }))
      };
      return { schemaVersion: 1, application: 'Xitolinos Planejamento', exportedAt: new Date().toISOString(), records };
    }
    const dashboard = buildMobileDashboard(state, url.searchParams.get('month') || today().slice(0, 7));
    const lines = [`XITOLINOS PLANEJAMENTO — ${dashboard.month}`, `Entradas esperadas: ${moneyText(dashboard.totals.incomeCents)}`, `Despesas contabilizadas e previstas: ${moneyText(dashboard.totals.expenseCents)}`, `Compromissos futuros: ${moneyText(dashboard.totals.committedCents)}`, `Saldo projetado: ${moneyText(dashboard.totals.projectedEndBalanceCents)}`, `Necessário cobrir: ${moneyText(dashboard.totals.coverageNeededCents)}`, '', 'DESPESAS CONSIDERADAS', ...dashboard.details.filter(row => row.type === 'expense').map(row => `${row.date} | ${row.description} | ${row.category} | ${row.status} | ${moneyText(row.amountCents)}`), '', 'Exportado localmente pelo Xitolinos Planejamento.'];
    return { text: lines.join('\n'), month: dashboard.month };
  }
  if (pathname === '/finance/restore' && method === 'POST') {
    const result = restoreMobileBackup(state, body);
    await writeMobileState(state);
    return result;
  }

  if (pathname === '/finance/billing/checkout' || pathname === '/finance/billing/portal') throw new Error('A assinatura online fica desligada no aplicativo local e offline.');
  if (pathname === '/finance/budgets' && method === 'POST') {
    const item = { id: state.nextId++, month: validMonth(body.month), limitCents: Math.max(0, Number(body.limitCents || 0)), categoryId: Number(body.categoryId), categoryName: state.categories.find(row => row.id === Number(body.categoryId))?.name || '' };
    const current = state.budgets.find(row => row.month === item.month && row.categoryId === item.categoryId);
    if (current) Object.assign(current, item); else state.budgets.push(item);
    await writeMobileState(state); return { item };
  }

  throw new Error('Este fluxo ainda não está disponível no aplicativo Android local.');
}
