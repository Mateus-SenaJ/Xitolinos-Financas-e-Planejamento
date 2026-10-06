'use strict';

const fs = require('node:fs');
const path = require('node:path');

const relationOwner = () => ({ type: 'relation', relation: 'manyToOne', target: 'plugin::users-permissions.user' });
const text = (required = false, maxLength = 160) => ({ type: 'string', required, maxLength });
const integer = (required = false, min = 0) => ({ type: 'integer', required, min });
const date = required => ({ type: 'date', required });
const enumeration = (enumValues, defaultValue) => ({ type: 'enumeration', enum: enumValues, ...(defaultValue ? { default: defaultValue } : {}) });
const relation = (target, rel = 'manyToOne') => ({ type: 'relation', relation: rel, target });
const owner = { owner: relationOwner() };
const types = [
  ['finance', 'finance_actions', 'Operações financeiras', { name: text(false, 60), ...owner }],
  ['account', 'accounts', 'Conta', {
    name: text(true, 60), institution: text(false, 60), type: enumeration(['checking','digital','cash','savings','reserve','investment','other'], 'checking'),
    openingBalanceCents: integer(), openingBalanceDate: date(false), isLiquid: { type: 'boolean', default: true }, status: enumeration(['active','archived'], 'active'), notes: { type: 'text' }, ...owner
  }],
  ['category', 'categories', 'Categoria', {
    name: text(true, 50), type: enumeration(['income','expense','transfer'], 'expense'), icon: text(false, 12), status: enumeration(['active','archived'], 'active'),
    parent: relation('api::category.category'), ...owner
  }],
  ['card', 'cards', 'Cartão', {
    name: text(true, 60), network: text(false, 30), lastFour: text(false, 4), closingDay: integer(true, 1), dueDay: integer(true, 1),
    limitCents: integer(), account: relation('api::account.account'), active: { type: 'boolean', default: true }, ...owner
  }],
  ['transaction', 'transactions', 'Movimentação', {
    description: text(true, 120), normalizedMerchant: text(false, 120), type: enumeration(['income','expense','transfer']),
    amountCents: integer(true, 1), date: date(true), dueDate: date(false), purchaseDate: date(false), paidAt: date(false),
    method: enumeration(['account','pix','cash','debit','card','transfer'], 'account'),
    status: enumeration(['paid','pending','planned','settled','voided'], 'paid'), source: enumeration(['manual','card','recurrence','import','shopping'], 'manual'),
    installmentGroup: text(false, 80), installmentNumber: integer(), installmentCount: integer(), memo: { type: 'text' }, receiptData: { type: 'json' }, statusBeforeDelete: enumeration(['paid','pending','planned','settled']), deletedAt: { type: 'datetime' },
    shoppingImportId: { ...text(false, 80), unique: true }, spendingContext: enumeration(['routine','extra']),
    legacyId: text(false, 120),
    account: relation('api::account.account'), counterpartyAccount: relation('api::account.account'), category: relation('api::category.category'),
    card: relation('api::card.card'), recurrence: relation('api::recurrence.recurrence'), incomeSource: relation('api::income-source.income-source'), ...owner
  }],
  ['recurrence', 'recurrences', 'Despesa recorrente', {
    name: text(true, 90), amountCents: integer(true, 1), frequency: enumeration(['weekly','fortnightly','monthly','yearly'], 'monthly'),
    dayOfMonth: integer(), startDate: date(true), endDate: date(false), method: enumeration(['account','pix','cash','debit','card'], 'account'),
    active: { type: 'boolean', default: true }, category: relation('api::category.category'), account: relation('api::account.account'), card: relation('api::card.card'), ...owner
  }],
  ['income-source', 'income_sources', 'Fonte de renda', {
    name: text(true, 90), amountCents: integer(true, 1), frequency: enumeration(['once','weekly','fortnightly','monthly','yearly'], 'monthly'),
    nextDate: date(true), endDate: date(false), occurrencesRemaining: integer(), reminderDaysBefore: integer(),
    alertEnabled: { type: 'boolean', default: true }, active: { type: 'boolean', default: true }, category: relation('api::category.category'), account: relation('api::account.account'), ...owner
  }],
  ['reserve', 'reserves', 'Reserva e investimento', {
    kind: enumeration(['emergency','savings','investment']), name: text(true, 70), balanceCents: integer(), targetCents: integer(),
    annualYieldBasisPoints: integer(), account: relation('api::account.account'), ...owner
  }],
  ['goal', 'goals', 'Meta', { name: text(true, 80), targetCents: integer(true, 1), savedCents: integer(), dueDate: date(false), ...owner }],
  ['budget', 'budgets', 'Orçamento', { month: text(true, 7), limitCents: integer(true), category: relation('api::category.category'), categoryName: text(true, 50), ...owner }],
  ['preference', 'preferences', 'Preferência', {
    theme: enumeration(['light','dark','system'], 'light'), accent: enumeration(['green','lime','gold'], 'green'),
    minimumReserveCents: integer(), cardStopDaysBefore: integer(), avatarDataUrl: { type: 'text' }, closeoutDay: integer(), ...owner
  }],
  ['month-close', 'month_closes', 'Fechamento mensal', {
    month: text(true, 7), cardPaid: { type: 'boolean', default: false }, deficitCovered: { type: 'boolean', default: false },
    reserveWithdrawalCents: integer(), savingsWithdrawalCents: integer(), investmentWithdrawalCents: integer(), notes: { type: 'text' }, confirmedAt: { type: 'datetime' }, ...owner
  }],
  ['audit-event', 'audit_events', 'Auditoria', {
    action: text(true, 40), entityType: text(true, 40), entityId: text(false, 80), beforeJson: { type: 'json' }, afterJson: { type: 'json' }, ...owner
  }],
  ['merchant-rule', 'merchant_rules', 'Regra de estabelecimento', {
    alias: text(true, 120), normalizedAlias: text(true, 120), canonicalName: text(true, 120), category: relation('api::category.category'), ...owner
  }],
  ['import-batch', 'import_batches', 'Importação', {
    fileName: text(true, 180), status: enumeration(['review','completed'], 'review'), duplicateCount: integer(), acceptedCount: integer(), ...owner
  }],
  ['desired-purchase', 'desired_purchases', 'Compra desejada', {
    name: text(true, 90), amountCents: integer(true, 1), urgency: enumeration(['low','normal','high'], 'normal'), desiredDate: date(false),
    category: relation('api::category.category'), status: enumeration(['planned','purchased','cancelled'], 'planned'), ...owner
  }],
  ['shopping-state', 'shopping_states', 'Listas de compras', {
    lists: { type: 'json', required: true, default: [] }, stock: { type: 'json', required: true, default: [] }, sharedViewerIds: { type: 'json', required: true, default: [] }, ...owner
  }],
  ['billing-subscription', 'billing_subscriptions', 'Assinatura Xitolinos', {
    provider: enumeration(['local','stripe'], 'local'), plan: text(true, 40), status: enumeration(['local','trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','paused'], 'local'),
    customerId: text(false, 120), subscriptionId: text(false, 120), checkoutAttemptId: text(false, 80), periodEnd: date(false), ...owner
  }],
  ['migration-state', 'migration_states', 'Controle de importação local', { key: text(true, 100), completedAt: { type: 'datetime' }, ...owner }],
  ['security-credential', 'security_credentials', 'Biometria deste dispositivo', {
    credentialId: text(true, 255), publicKey: { type: 'text', required: true }, counter: integer(), transports: { type: 'json' }, deviceName: text(false, 80), ...owner
  }]
];

for (const [name, collectionName, displayName, attributes] of types) {
  const apiFolder = name;
  const schemaPath = path.join(__dirname, 'src', 'api', apiFolder, 'content-types', name, 'schema.json');
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  const schema = {
    kind: 'collectionType', collectionName,
    info: { singularName: name, pluralName: collectionName.replace(/_/g, '-'), displayName, description: '' },
    options: { draftAndPublish: false }, pluginOptions: {}, attributes
  };
  fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
}
