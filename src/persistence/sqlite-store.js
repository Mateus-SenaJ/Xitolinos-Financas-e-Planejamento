'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const { parseMoneyToCents } = require('../domain/money');

const seed = {
  accounts: [{ id: 'account-main', name: 'Conta principal', institution: '', type: 'checking', openingBalanceCents: 0, isLiquid: true, priority: 1, status: 'active' }],
  categories: [
    { id: 'category-home', name: 'Moradia', type: 'expense' }, { id: 'category-market', name: 'Mercado', type: 'expense' },
    { id: 'category-transport', name: 'Transporte', type: 'expense' }, { id: 'category-food', name: 'Alimentação', type: 'expense' },
    { id: 'category-health', name: 'Saúde', type: 'expense' }, { id: 'category-subscriptions', name: 'Assinaturas', type: 'expense' },
    { id: 'category-leisure', name: 'Lazer', type: 'expense' }, { id: 'category-salary', name: 'Salário', type: 'income' },
    { id: 'category-other', name: 'Outros', type: 'expense' }, { id: 'category-transfer', name: 'Transferência', type: 'transfer' }
  ],
  transactions: [
    { id: 'seed-01', description: 'Salário', category: 'Salário', date: '2026-09-30', type: 'income', amountCents: 850000 },
    { id: 'seed-02', description: 'Projeto freelance', category: 'Outros', date: '2026-09-28', type: 'income', amountCents: 45000 },
    { id: 'seed-03', description: 'Aluguel', category: 'Moradia', date: '2026-09-26', type: 'expense', amountCents: 180000 },
    { id: 'seed-04', description: 'Feira da semana', category: 'Mercado', date: '2026-09-24', type: 'expense', amountCents: 76000 },
    { id: 'seed-05', description: 'Internet fibra', category: 'Moradia', date: '2026-09-21', type: 'expense', amountCents: 11990 },
    { id: 'seed-06', description: 'Recarga transporte', category: 'Transporte', date: '2026-09-19', type: 'expense', amountCents: 32500 },
    { id: 'seed-07', description: 'Jantar com amigos', category: 'Alimentação', date: '2026-09-16', type: 'expense', amountCents: 18400 },
    { id: 'seed-08', description: 'Streaming', category: 'Assinaturas', date: '2026-09-12', type: 'expense', amountCents: 4500 },
    { id: 'seed-09', description: 'Farmácia', category: 'Saúde', date: '2026-09-10', type: 'expense', amountCents: 11000 },
    { id: 'seed-10', description: 'Conta de luz', category: 'Moradia', date: '2026-09-08', type: 'expense', amountCents: 22000 },
    { id: 'seed-11', description: 'Academia', category: 'Saúde', date: '2026-09-05', type: 'expense', amountCents: 8900 },
    { id: 'seed-12', description: 'Almoço de domingo', category: 'Alimentação', date: '2026-09-02', type: 'expense', amountCents: 13110 }
  ],
  budgets: [
    { category: 'Moradia', limitCents: 230000 }, { category: 'Mercado', limitCents: 100000 },
    { category: 'Transporte', limitCents: 50000 }, { category: 'Alimentação', limitCents: 50000 },
    { category: 'Saúde', limitCents: 40000 }, { category: 'Assinaturas', limitCents: 15000 },
    { category: 'Lazer e outros', limitCents: 15000 }
  ],
  goals: [
    { id: 'goal-01', name: 'Reserva de emergência', savedCents: 720000, targetCents: 1200000, symbol: '↗' },
    { id: 'goal-02', name: 'Viagem de férias', savedCents: 185000, targetCents: 500000, symbol: '⌁' }
  ]
};

function migrateLegacyState(legacy) {
  return {
    transactions: (legacy.transactions || []).map(item => ({ ...item, amountCents: parseMoneyToCents(item.amount) })).map(({ amount, ...item }) => item),
    budgets: (legacy.budgets || []).map(item => ({ category: item.category, limitCents: parseMoneyToCents(item.limit) })),
    goals: (legacy.goals || []).map(item => ({ ...item, savedCents: parseMoneyToCents(item.saved), targetCents: parseMoneyToCents(item.target) })).map(({ saved, target, ...item }) => item)
  };
}

class SqliteStore {
  constructor(filePath, legacyFilePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.database = new Database(filePath);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('foreign_keys = ON');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY, description TEXT NOT NULL, category TEXT NOT NULL,
        date TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0), deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC);
      CREATE INDEX IF NOT EXISTS transactions_category_idx ON transactions(category);
      CREATE TABLE IF NOT EXISTS budgets (
        category TEXT PRIMARY KEY, limit_cents INTEGER NOT NULL CHECK (limit_cents >= 0)
      );
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, saved_cents INTEGER NOT NULL CHECK (saved_cents >= 0),
        target_cents INTEGER NOT NULL CHECK (target_cents > 0), symbol TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
      );
    `);
    this.applyCoreMigration();
    this.applyPhaseOneMigration();
    this.applyEstablishmentStatusMigration();
    this.initialize(legacyFilePath);
  }

  initialize(legacyFilePath) {
    const initialized = this.database.prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 1').get().count;
    if (initialized === 0) {
      let state = seed;
      if (legacyFilePath && fs.existsSync(legacyFilePath)) {
        state = migrateLegacyState(JSON.parse(fs.readFileSync(legacyFilePath, 'utf8')));
      }
      this.saveState(state);
      this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
    }
  }

  applyCoreMigration() {
    const version = this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version || 0;
    if (version >= 2) return;
    const migrate = this.database.transaction(() => {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, institution TEXT NOT NULL DEFAULT '', type TEXT NOT NULL,
          opening_balance_cents INTEGER NOT NULL DEFAULT 0, is_liquid INTEGER NOT NULL DEFAULT 1,
          priority INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active'
        );
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT NOT NULL, parent_id TEXT,
          icon TEXT NOT NULL DEFAULT '', FOREIGN KEY(parent_id) REFERENCES categories(id)
        );
      `);
      const transactionColumns = this.database.prepare('PRAGMA table_info(transactions)').all().map(column => column.name);
      if (!transactionColumns.includes('account_id')) this.database.exec('ALTER TABLE transactions ADD COLUMN account_id TEXT REFERENCES accounts(id)');
      if (!transactionColumns.includes('counterparty_account_id')) this.database.exec('ALTER TABLE transactions ADD COLUMN counterparty_account_id TEXT REFERENCES accounts(id)');
      const legacyRows = this.database.prepare('SELECT id FROM transactions WHERE account_id IS NULL').all();
      this.database.prepare(`INSERT OR IGNORE INTO accounts(id, name, institution, type, opening_balance_cents, is_liquid, priority, status)
        VALUES (@id, @name, @institution, @type, @openingBalanceCents, @isLiquid, @priority, @status)`).run({
        id: seed.accounts[0].id, name: seed.accounts[0].name, institution: '', type: 'checking', openingBalanceCents: 0, isLiquid: 1, priority: 1, status: 'active'
      });
      const setAccount = this.database.prepare('UPDATE transactions SET account_id = ? WHERE id = ?');
      for (const row of legacyRows) setAccount.run(seed.accounts[0].id, row.id);
      const insertCategory = this.database.prepare('INSERT OR IGNORE INTO categories(id, name, type) VALUES (@id, @name, @type)');
      for (const category of seed.categories) insertCategory.run(category);
      const insertBudget = this.database.prepare('INSERT OR IGNORE INTO budgets(category, limit_cents) VALUES (?, ?)');
      const readCategory = this.database.prepare('SELECT name FROM categories WHERE name = ?');
      for (const budget of this.database.prepare('SELECT category FROM budgets').all()) {
        if (!readCategory.get(budget.category)) insertCategory.run({ id: `category-${Buffer.from(budget.category).toString('hex')}`, name: budget.category, type: 'expense' });
      }
      this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (2, ?)').run(new Date().toISOString());
    });
    migrate();
  }

  applyPhaseOneMigration() {
    const version = this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version || 0;
    if (version >= 3) return;
    const migrate = this.database.transaction(() => {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS establishments (
          id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, default_category TEXT,
          tags_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS establishment_aliases (
          id TEXT PRIMARY KEY, establishment_id TEXT NOT NULL REFERENCES establishments(id),
          alias TEXT NOT NULL, normalized_alias TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
          action TEXT NOT NULL, before_json TEXT, after_json TEXT, actor TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_events(entity_type, entity_id, created_at DESC);
      `);

      const accountColumns = this.database.prepare('PRAGMA table_info(accounts)').all().map(column => column.name);
      if (!accountColumns.includes('notes')) this.database.exec("ALTER TABLE accounts ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
      const categoryColumns = this.database.prepare('PRAGMA table_info(categories)').all().map(column => column.name);
      if (!categoryColumns.includes('status')) this.database.exec("ALTER TABLE categories ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");

      this.database.exec(`
        CREATE TABLE transactions_new (
          id TEXT PRIMARY KEY, description TEXT NOT NULL, original_description TEXT NOT NULL,
          category TEXT NOT NULL, subcategory_id TEXT REFERENCES categories(id), date TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          account_id TEXT NOT NULL REFERENCES accounts(id),
          counterparty_account_id TEXT REFERENCES accounts(id),
          establishment_id TEXT REFERENCES establishments(id),
          status TEXT NOT NULL DEFAULT 'POSTED', deleted_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
      `);
      const timestamp = new Date().toISOString();
      this.database.prepare(`INSERT INTO transactions_new (
        id, description, original_description, category, date, type, amount_cents,
        account_id, counterparty_account_id, status, deleted_at, created_at, updated_at
      ) SELECT id, description, description, category, date, type, amount_cents,
        account_id, counterparty_account_id, 'POSTED', deleted_at, ?, ? FROM transactions`).run(timestamp, timestamp);
      this.database.exec('DROP TABLE transactions; ALTER TABLE transactions_new RENAME TO transactions;');
      this.database.exec(`
        CREATE INDEX transactions_date_idx ON transactions(date DESC);
        CREATE INDEX transactions_category_idx ON transactions(category);
        CREATE INDEX transactions_account_date_idx ON transactions(account_id, date DESC);
        CREATE INDEX transactions_active_date_idx ON transactions(deleted_at, date DESC);
      `);
      this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (3, ?)').run(timestamp);
    });
    migrate();
  }

  applyEstablishmentStatusMigration() {
    const version = this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version || 0;
    if (version >= 4) return;
    const migrate = this.database.transaction(() => {
      const columns = this.database.prepare('PRAGMA table_info(establishments)').all().map(column => column.name);
      if (!columns.includes('status')) this.database.exec("ALTER TABLE establishments ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (4, ?)').run(new Date().toISOString());
    });
    migrate();
  }

  loadState() {
    const establishments = this.database.prepare(`SELECT id, name, default_category AS defaultCategory, tags_json AS tagsJson, status
      FROM establishments ORDER BY name`).all();
    const aliases = this.database.prepare('SELECT establishment_id AS establishmentId, alias FROM establishment_aliases ORDER BY alias').all();
    const aliasesByEstablishment = new Map();
    for (const alias of aliases) {
      const list = aliasesByEstablishment.get(alias.establishmentId) || [];
      list.push(alias.alias);
      aliasesByEstablishment.set(alias.establishmentId, list);
    }
    return {
      accounts: this.database.prepare('SELECT id, name, institution, type, opening_balance_cents AS openingBalanceCents, is_liquid AS isLiquid, priority, status, notes FROM accounts ORDER BY priority, name').all().map(account => ({ ...account, isLiquid: Boolean(account.isLiquid) })),
      categories: this.database.prepare("SELECT id, name, type, parent_id AS parentId, icon, status FROM categories WHERE name <> 'Lazer e outros' ORDER BY type, name").all(),
      transactions: this.database.prepare(`SELECT id, description, original_description AS originalDescription, category,
        subcategory_id AS subcategoryId, date, type, amount_cents AS amountCents, account_id AS accountId,
        counterparty_account_id AS counterpartyAccountId, establishment_id AS establishmentId, status
        FROM transactions WHERE deleted_at IS NULL ORDER BY date DESC, rowid DESC`).all(),
      budgets: this.database.prepare('SELECT category, limit_cents AS limitCents FROM budgets ORDER BY rowid').all(),
      goals: this.database.prepare('SELECT id, name, saved_cents AS savedCents, target_cents AS targetCents, symbol FROM goals ORDER BY rowid').all(),
      establishments: establishments.map(item => ({ id: item.id, name: item.name, defaultCategory: item.defaultCategory, tags: JSON.parse(item.tagsJson), status: item.status, aliases: aliasesByEstablishment.get(item.id) || [] }))
    };
  }

  saveState(state, auditEvent = null) {
    const save = this.database.transaction(() => {
      const timestamp = new Date().toISOString();
      this.database.prepare('DELETE FROM transactions WHERE deleted_at IS NULL').run();
      this.database.prepare('DELETE FROM budgets').run();
      this.database.prepare('DELETE FROM goals').run();
      if (state.accounts) {
        const account = this.database.prepare(`INSERT INTO accounts(id, name, institution, type, opening_balance_cents, is_liquid, priority, status, notes)
          VALUES (@id, @name, @institution, @type, @openingBalanceCents, @isLiquid, @priority, @status, @notes)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, institution=excluded.institution, type=excluded.type,
          opening_balance_cents=excluded.opening_balance_cents, is_liquid=excluded.is_liquid,
          priority=excluded.priority, status=excluded.status, notes=excluded.notes`);
        for (const item of state.accounts) account.run({ ...item, institution: item.institution || '', isLiquid: item.isLiquid ? 1 : 0, priority: item.priority || 1, status: item.status || 'active', notes: item.notes || '' });
      }
      if (state.categories) {
        const category = this.database.prepare(`INSERT INTO categories(id, name, type, parent_id, icon, status)
          VALUES (@id, @name, @type, @parentId, @icon, @status)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, parent_id=excluded.parent_id, icon=excluded.icon, status=excluded.status`);
        const orderedCategories = [...state.categories].sort((left, right) => Number(Boolean(left.parentId)) - Number(Boolean(right.parentId)));
        for (const item of orderedCategories) category.run({ ...item, parentId: item.parentId || null, icon: item.icon || '', status: item.status || 'active' });
      }
      if (state.establishments) {
        const establishment = this.database.prepare(`INSERT INTO establishments(id, name, default_category, tags_json, created_at, updated_at, status)
          VALUES (@id, @name, @defaultCategory, @tagsJson, @createdAt, @updatedAt, @status)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, default_category=excluded.default_category,
          tags_json=excluded.tags_json, updated_at=excluded.updated_at, status=excluded.status`);
        const deleteAliases = this.database.prepare('DELETE FROM establishment_aliases WHERE establishment_id = ?');
        const insertAlias = this.database.prepare('INSERT INTO establishment_aliases(id, establishment_id, alias, normalized_alias) VALUES (?, ?, ?, ?)');
        for (const item of state.establishments) {
          establishment.run({ id: item.id, name: item.name, defaultCategory: item.defaultCategory || null, tagsJson: JSON.stringify(item.tags || []), createdAt: item.createdAt || timestamp, updatedAt: timestamp, status: item.status || 'active' });
          deleteAliases.run(item.id);
          for (const alias of item.aliases || []) insertAlias.run(randomUUID(), item.id, alias, alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim());
        }
      }
      const transaction = this.database.prepare(`INSERT INTO transactions(
        id, description, original_description, category, subcategory_id, date, type, amount_cents,
        account_id, counterparty_account_id, establishment_id, status, created_at, updated_at
      ) VALUES (@id, @description, @originalDescription, @category, @subcategoryId, @date, @type, @amountCents,
        @accountId, @counterpartyAccountId, @establishmentId, @status, @createdAt, @updatedAt)`);
      const budget = this.database.prepare('INSERT INTO budgets(category, limit_cents) VALUES (@category, @limitCents)');
      const goal = this.database.prepare('INSERT INTO goals(id, name, saved_cents, target_cents, symbol) VALUES (@id, @name, @savedCents, @targetCents, @symbol)');
      for (const item of state.transactions) transaction.run({ ...item, originalDescription: item.originalDescription || item.description, subcategoryId: item.subcategoryId || null, accountId: item.accountId || 'account-main', counterpartyAccountId: item.counterpartyAccountId || null, establishmentId: item.establishmentId || null, status: item.status || 'POSTED', createdAt: item.createdAt || timestamp, updatedAt: timestamp });
      for (const item of state.budgets) budget.run(item);
      for (const item of state.goals) goal.run(item);
      if (auditEvent) this.insertAuditEvent(auditEvent);
    });
    save();
  }

  insertAuditEvent(event) {
    this.database.prepare(`INSERT INTO audit_events(id, entity_type, entity_id, action, before_json, after_json, actor, created_at)
      VALUES (@id, @entityType, @entityId, @action, @beforeJson, @afterJson, @actor, @createdAt)`).run({
      id: event.id, entityType: event.entityType, entityId: event.entityId, action: event.action,
      beforeJson: event.before === null || event.before === undefined ? null : JSON.stringify(event.before),
      afterJson: event.after === null || event.after === undefined ? null : JSON.stringify(event.after),
      actor: event.actor || 'local-user', createdAt: event.createdAt
    });
  }

  softDeleteTransaction(id, event) {
    const remove = this.database.transaction(() => {
      const before = this.database.prepare('SELECT id, description, category, date, type, amount_cents AS amountCents, account_id AS accountId FROM transactions WHERE id = ? AND deleted_at IS NULL').get(id);
      if (!before) return null;
      this.database.prepare('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(event.createdAt, event.createdAt, id);
      this.insertAuditEvent({ ...event, entityType: 'transaction', entityId: id, action: 'soft_delete', before, after: { ...before, deletedAt: event.createdAt } });
      return before;
    });
    return remove();
  }

  restoreTransaction(id, event) {
    const restore = this.database.transaction(() => {
      const before = this.database.prepare('SELECT id, description, category, date, type, amount_cents AS amountCents, account_id AS accountId, deleted_at AS deletedAt FROM transactions WHERE id = ? AND deleted_at IS NOT NULL').get(id);
      if (!before) return null;
      this.database.prepare('UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(event.createdAt, id);
      this.insertAuditEvent({ ...event, entityType: 'transaction', entityId: id, action: 'restore', before, after: { ...before, deletedAt: null } });
      return { ...before, deletedAt: null };
    });
    return restore();
  }

  loadTrash() {
    return this.database.prepare(`SELECT id, description, original_description AS originalDescription, category, date, type,
      amount_cents AS amountCents, account_id AS accountId, deleted_at AS deletedAt
      FROM transactions WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`).all();
  }

  loadAudit(limit = 100) {
    return this.database.prepare(`SELECT id, entity_type AS entityType, entity_id AS entityId, action,
      before_json AS beforeJson, after_json AS afterJson, actor, created_at AS createdAt
      FROM audit_events ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(limit).map(event => ({
      ...event, before: event.beforeJson ? JSON.parse(event.beforeJson) : null,
      after: event.afterJson ? JSON.parse(event.afterJson) : null
    }));
  }

  close() { this.database.close(); }
}

module.exports = { SqliteStore, migrateLegacyState, seed };