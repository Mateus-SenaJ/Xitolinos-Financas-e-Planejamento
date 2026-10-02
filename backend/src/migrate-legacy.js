'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { normalizeMerchant, duplicateKey } = require('./finance-engine');

const uid = name => `api::${name}.${name}`;
const today = () => new Date().toISOString().slice(0, 10);

async function owned(strapi, name, owner) {
  return strapi.entityService.findMany(uid(name), { filters: { owner: { id: owner } }, populate: '*', limit: 10000 });
}

async function findBy(strapi, name, owner, predicate) {
  return (await owned(strapi, name, owner)).find(predicate);
}

async function importSqlite(strapi, owner, databasePath, context) {
  if (!fs.existsSync(databasePath)) return { accounts: new Map(), categories: new Map(), importedTransactions: 0 };
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const counts = { accounts: 0, categories: 0, transactions: 0, budgets: 0, goals: 0 };
  try {
    const categoryRows = database.prepare('SELECT * FROM categories').all();
    const categoryIds = new Map();
    for (const row of categoryRows) {
      const type = ['income','expense','transfer'].includes(row.type) ? row.type : 'expense';
      let item = await findBy(strapi, 'category', owner, value => value.name === row.name);
      const record = { name: String(row.name || 'Outros').slice(0, 50), type, icon: String(row.icon || '').slice(0, 12), status: row.status === 'archived' ? 'archived' : 'active', owner };
      item = item ? await strapi.entityService.update(uid('category'), item.id, { data: record }) : await strapi.entityService.create(uid('category'), { data: record });
      categoryIds.set(String(row.id), item.id);
      context.categoryNames.set(String(row.name), item.id);
      counts.categories += 1;
    }
    for (const row of categoryRows) if (row.parent_id && categoryIds.has(String(row.parent_id)) && categoryIds.has(String(row.id))) {
      await strapi.entityService.update(uid('category'), categoryIds.get(String(row.id)), { data: { parent: categoryIds.get(String(row.parent_id)) } });
    }

    const accountRows = database.prepare('SELECT * FROM accounts').all();
    const accountIds = new Map();
    for (const row of accountRows) {
      const allowedType = ['checking','digital','cash','savings','reserve','investment','other'];
      const item = await findBy(strapi, 'account', owner, value => value.name === row.name);
      const record = { name: String(row.name || 'Conta principal').slice(0, 60), institution: String(row.institution || '').slice(0, 60), type: allowedType.includes(row.type) ? row.type : 'other', openingBalanceCents: Number(row.opening_balance_cents || 0), isLiquid: Boolean(row.is_liquid), status: row.status === 'archived' ? 'archived' : 'active', notes: String(row.notes || '').slice(0, 1000), owner };
      const updated = item ? await strapi.entityService.update(uid('account'), item.id, { data: record }) : await strapi.entityService.create(uid('account'), { data: record });
      accountIds.set(String(row.id), updated.id);
      context.accountNames.set(String(row.name), updated.id);
      counts.accounts += 1;
    }

    if (database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='transactions'").get().count) {
      for (const row of database.prepare('SELECT * FROM transactions').all()) {
        const sourceId = String(row.id);
        const matchedAccount = accountIds.get(String(row.account_id)) || context.accountNames.get('Conta principal') || context.defaultAccountId;
        if (!matchedAccount || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.date))) continue;
        const type = ['income','expense','transfer'].includes(row.type) ? row.type : 'expense';
        const categoryId = categoryIds.get(String(row.subcategory_id)) || context.categoryNames.get(String(row.category)) || context.otherCategoryId;
        const date = String(row.date).slice(0, 10);
        const existing = await findBy(strapi, 'transaction', owner, item => item.legacyId === sourceId || (item.date === date && item.amountCents === Number(row.amount_cents) && item.type === type && normalizeMerchant(item.description) === normalizeMerchant(row.description)));
        const status = row.deleted_at ? 'voided' : ({ POSTED: 'paid', paid: 'paid', PENDING: 'pending', pending: 'pending', PLANNED: 'planned', planned: 'planned', SETTLED: 'settled', settled: 'settled' }[row.status] || (date <= today() ? 'paid' : 'planned'));
        const record = {
          description: String(row.description || row.original_description || 'Despesa importada').slice(0, 120),
          normalizedMerchant: normalizeMerchant(row.original_description || row.description), legacyId: sourceId,
          type, amountCents: Math.max(1, Number(row.amount_cents || 1)), date, dueDate: date, purchaseDate: date,
          paidAt: status === 'paid' ? date : undefined, method: type === 'transfer' ? 'transfer' : 'account', status,
          source: 'import', account: matchedAccount, counterpartyAccount: accountIds.get(String(row.counterparty_account_id)) || undefined,
          category: type === 'transfer' ? undefined : categoryId, memo: String(row.original_description || '').slice(0, 500),
          deletedAt: row.deleted_at || undefined, owner
        };
        if (existing) {
          await strapi.entityService.update(uid('transaction'), existing.id, { data: record });
          if (!existing.legacyId) counts.transactions += 1;
        } else {
          await strapi.entityService.create(uid('transaction'), { data: record });
          counts.transactions += 1;
        }
      }
    }

    const month = today().slice(0, 7);
    for (const row of database.prepare('SELECT * FROM budgets').all()) {
      const categoryId = context.categoryNames.get(String(row.category)) || context.otherCategoryId;
      const current = await findBy(strapi, 'budget', owner, item => item.month === month && item.categoryName === row.category);
      const record = { month, categoryName: String(row.category).slice(0, 50), limitCents: Math.max(0, Number(row.limit_cents || 0)), category: categoryId, owner };
      if (current) await strapi.entityService.update(uid('budget'), current.id, { data: record });
      else await strapi.entityService.create(uid('budget'), { data: record });
      counts.budgets += 1;
    }
    for (const row of database.prepare('SELECT * FROM goals').all()) {
      const current = await findBy(strapi, 'goal', owner, item => item.name === row.name);
      const record = { name: String(row.name).slice(0, 80), savedCents: Math.max(0, Number(row.saved_cents || 0)), targetCents: Math.max(1, Number(row.target_cents || 1)), owner };
      if (current) await strapi.entityService.update(uid('goal'), current.id, { data: record });
      else await strapi.entityService.create(uid('goal'), { data: record });
      counts.goals += 1;
    }
  } finally { database.close(); }
  return { counts };
}

async function importStoreJson(strapi, owner, jsonPath, context) {
  const counts = { transactions: 0, budgets: 0, goals: 0 };
  if (!fs.existsSync(jsonPath)) return counts;
  const snapshot = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const databaseTransactions = await owned(strapi, 'transaction', owner);
  for (const row of Array.isArray(snapshot.transactions) ? snapshot.transactions : []) {
    const description = String(row.description || '').trim().slice(0, 120);
    const date = String(row.date || '').slice(0, 10);
    const amountCents = Math.max(1, Math.round(Number(row.amountCents ?? (Number(row.amount) * 100)) || 1));
    if (!description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const type = row.type === 'income' ? 'income' : 'expense';
    const key = duplicateKey({ description, date, amountCents, type });
    if (databaseTransactions.some(item => item.legacyId === `json:${row.id}` || duplicateKey(item) === key)) continue;
    const category = context.categoryNames.get(String(row.category)) || context.otherCategoryId;
    const item = await strapi.entityService.create(uid('transaction'), { data: {
      description, normalizedMerchant: normalizeMerchant(description), legacyId: `json:${String(row.id || key).slice(0, 100)}`,
      type, amountCents, date, dueDate: date, purchaseDate: date, paidAt: date <= today() ? date : undefined,
      method: 'account', status: date <= today() ? 'paid' : 'planned', source: 'import', account: context.defaultAccountId, category, owner
    } });
    databaseTransactions.push(item);
    counts.transactions += 1;
  }
  for (const row of Array.isArray(snapshot.budgets) ? snapshot.budgets : []) {
    const name = String(row.category || '').slice(0, 50);
    if (!name) continue;
    const current = await findBy(strapi, 'budget', owner, item => item.month === today().slice(0, 7) && item.categoryName === name);
    const record = { month: today().slice(0, 7), categoryName: name, limitCents: Math.max(0, Math.round(Number(row.limitCents ?? Number(row.limit) * 100) || 0)), category: context.categoryNames.get(name) || context.otherCategoryId, owner };
    if (current) await strapi.entityService.update(uid('budget'), current.id, { data: record });
    else await strapi.entityService.create(uid('budget'), { data: record });
    counts.budgets += 1;
  }
  for (const row of Array.isArray(snapshot.goals) ? snapshot.goals : []) {
    const name = String(row.name || '').slice(0, 80);
    if (!name) continue;
    const current = await findBy(strapi, 'goal', owner, item => item.name === name);
    const record = { name, savedCents: Math.max(0, Math.round(Number(row.savedCents ?? Number(row.saved) * 100) || 0)), targetCents: Math.max(1, Math.round(Number(row.targetCents ?? Number(row.target) * 100) || 1)), owner };
    if (current) await strapi.entityService.update(uid('goal'), current.id, { data: record });
    else await strapi.entityService.create(uid('goal'), { data: record });
    counts.goals += 1;
  }
  return counts;
}

async function migrateLegacyData(strapi, user) {
  const marker = await findBy(strapi, 'migration-state', user.id, item => item.key === 'legacy-sqlite-and-json-v1');
  if (marker) return;
  const projectRoot = path.resolve(__dirname, '../..');
  const databasePath = path.join(projectRoot, 'data', 'finance.sqlite');
  const jsonPath = path.join(projectRoot, 'data', 'store.json');
  if (!fs.existsSync(databasePath) && !fs.existsSync(jsonPath)) return;
  const accounts = await owned(strapi, 'account', user.id);
  const categories = await owned(strapi, 'category', user.id);
  const context = {
    accountNames: new Map(accounts.map(item => [item.name, item.id])),
    categoryNames: new Map(categories.map(item => [item.name, item.id])),
    defaultAccountId: accounts.find(item => item.name === 'Conta principal')?.id || accounts[0]?.id,
    otherCategoryId: categories.find(item => item.name === 'Outros')?.id
  };
  const sqlite = await importSqlite(strapi, user.id, databasePath, context);
  const json = await importStoreJson(strapi, user.id, jsonPath, context);
  const totals = {
    sqlite: sqlite.counts || sqlite,
    json,
    completedAt: new Date().toISOString()
  };
  await strapi.entityService.create(uid('migration-state'), { data: { key: 'legacy-sqlite-and-json-v1', completedAt: totals.completedAt, owner: user.id } });
  strapi.log.info(`Dados locais antigos importados para o MySQL do perfil ${user.id}: ${JSON.stringify(totals)}`);
}

module.exports = { migrateLegacyData, importSqlite, importStoreJson };
