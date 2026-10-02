'use strict';

const uid = name => `api::${name}.${name}`;
const demoTransactions = [
  ['Salário', 'Salário', '2026-09-30', 'income', 850000],
  ['Projeto freelance', 'Outros', '2026-09-28', 'income', 45000],
  ['Aluguel', 'Moradia', '2026-09-26', 'expense', 180000],
  ['Feira da semana', 'Mercado', '2026-09-24', 'expense', 76000],
  ['Internet fibra', 'Moradia', '2026-09-21', 'expense', 11990],
  ['Recarga transporte', 'Transporte', '2026-09-19', 'expense', 32500],
  ['Jantar com amigos', 'Alimentação', '2026-09-16', 'expense', 18400],
  ['Streaming', 'Assinaturas', '2026-09-12', 'expense', 4500],
  ['Farmácia Drogasil', 'Saúde', '2026-09-10', 'expense', 11000],
  ['Conta de luz', 'Moradia', '2026-09-08', 'expense', 22000],
  ['Academia', 'Saúde', '2026-09-05', 'expense', 8900],
  ['Almoço de domingo', 'Alimentação', '2026-09-02', 'expense', 13110]
];

async function rows(strapi, name, userId) {
  return strapi.db.query(uid(name)).findMany({ where: { owner: userId }, limit: 2000 });
}

async function createIfMissing(strapi, name, userId, match, data) {
  const existing = await rows(strapi, name, userId);
  if (existing.some(item => match(item))) return existing.find(match);
  return strapi.entityService.create(uid(name), { data: { ...data, owner: userId } });
}

async function seedUser(strapi, user) {
  const ownerId = user.id;
  const categories = new Map();
  const categoryNames = ['Moradia','Mercado','Transporte','Alimentação','Saúde','Assinaturas','Lazer','Salário','Outros','Transferência'];
  for (const name of categoryNames) {
    const item = await createIfMissing(strapi, 'category', ownerId, row => row.name === name, {
      name, type: name === 'Salário' ? 'income' : name === 'Transferência' ? 'transfer' : 'expense', status: 'active'
    });
    categories.set(name, item.id);
  }
  const account = await createIfMissing(strapi, 'account', ownerId, row => row.name === 'Conta principal', {
    name: 'Conta principal', institution: 'Conta demonstrativa', type: 'checking', openingBalanceCents: 0, isLiquid: true, status: 'active'
  });
  const reserveAccounts = new Map();
  for (const [name, type, balanceCents] of [
    ['Reserva de emergência', 'reserve', 720000], ['Poupança', 'savings', 185000], ['Investimentos', 'investment', 450000]
  ]) {
    const item = await createIfMissing(strapi, 'account', ownerId, row => row.name === name, {
      name, institution: 'Conta demonstrativa', type, openingBalanceCents: balanceCents, isLiquid: false, status: 'active'
    });
    reserveAccounts.set(name, item.id);
  }
  const card = await createIfMissing(strapi, 'card', ownerId, row => row.name === 'Cartão principal', {
    name: 'Cartão principal', network: 'Crédito', lastFour: '4242', closingDay: 8, dueDay: 18, limitCents: 1200000, account: account.id, active: true
  });
  if ((await rows(strapi, 'transaction', ownerId)).length === 0) {
    for (const [description, category, date, type, amountCents] of demoTransactions) {
      await strapi.entityService.create(uid('transaction'), { data: {
        description, normalizedMerchant: description, date, dueDate: date, type, amountCents,
        method: 'account', status: 'paid', source: 'manual', category: categories.get(category), account: account.id, owner: ownerId
      } });
    }
  }
  const recurrences = [
    ['Aluguel', 'Moradia', 180000, 5], ['Conta de energia', 'Moradia', 22000, 8],
    ['Plano de celular', 'Assinaturas', 6990, 11], ['Seguro do veículo', 'Transporte', 14900, 15],
    ['Internet fibra', 'Moradia', 11990, 20], ['Garagem', 'Moradia', 25000, 25]
  ];
  for (const [name, category, amountCents, dayOfMonth] of recurrences) await createIfMissing(strapi, 'recurrence', ownerId, row => row.name === name, {
    name, category: categories.get(category), amountCents, frequency: 'monthly', dayOfMonth, startDate: '2026-10-01',
    method: 'account', account: account.id, active: true
  });
  await createIfMissing(strapi, 'income-source', ownerId, row => row.name === 'Salário mensal', {
    name: 'Salário mensal', amountCents: 850000, frequency: 'monthly', nextDate: '2026-10-30',
    reminderDaysBefore: 2, alertEnabled: true, active: true, category: categories.get('Salário'), account: account.id
  });
  await createIfMissing(strapi, 'income-source', ownerId, row => row.name === 'Projeto eventual', {
    name: 'Projeto eventual', amountCents: 45000, frequency: 'once', nextDate: '2026-10-22',
    reminderDaysBefore: 1, alertEnabled: true, active: true, category: categories.get('Outros'), account: account.id
  });
  const reserves = [
    ['emergency', 'Reserva de emergência', 720000, 1200000, 0],
    ['savings', 'Poupança', 185000, 500000, 500],
    ['investment', 'Investimentos', 450000, 1000000, 700]
  ];
  for (const [kind, name, balanceCents, targetCents, annualYieldBasisPoints] of reserves) await createIfMissing(strapi, 'reserve', ownerId, row => row.kind === kind, {
    kind, name, balanceCents, targetCents, annualYieldBasisPoints, account: reserveAccounts.get(name)
  });
  const limits = [['Moradia',230000],['Mercado',100000],['Transporte',50000],['Alimentação',50000],['Saúde',40000],['Assinaturas',15000],['Lazer',15000]];
  for (const [categoryName, limitCents] of limits) await createIfMissing(strapi, 'budget', ownerId, row => row.categoryName === categoryName && row.month === '2026-10', {
    category: categories.get(categoryName), categoryName, month: '2026-10', limitCents
  });
  await createIfMissing(strapi, 'goal', ownerId, row => row.name === 'Viagem de férias', {
    name: 'Viagem de férias', targetCents: 500000, savedCents: 185000, dueDate: '2027-07-01'
  });
  await createIfMissing(strapi, 'preference', ownerId, () => true, {
    theme: 'light', accent: 'green', minimumReserveCents: 50000, cardStopDaysBefore: 3, closeoutDay: 1
  });
  await createIfMissing(strapi, 'billing-subscription', ownerId, () => true, { provider: 'local', plan: 'local', status: 'local' });
}

async function seedDemoData(strapi) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  const service = strapi.plugin('users-permissions').service('user');
  const demoUsers = [
    { username: 'demo-xitolinos', email: 'demo@xitolinos.local', profile: 'owner' },
    { username: 'consulta-xitolinos', email: 'consulta@xitolinos.local', profile: 'viewer' }
  ];
  for (const item of demoUsers) {
    let user = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { email: item.email } });
    if (!user) user = await service.add({
      ...item, password: process.env.DEMO_USER_PASSWORD || 'Xitolinos-Demo-2026!', provider: 'local', confirmed: true, blocked: false, role: role.id
    });
    if (user.profile !== item.profile) await strapi.db.query('plugin::users-permissions.user').update({ where: { id: user.id }, data: { profile: item.profile } });
    await seedUser(strapi, user);
  }
}

module.exports = { seedDemoData, demoTransactions };
