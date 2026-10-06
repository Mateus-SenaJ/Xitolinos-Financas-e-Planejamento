const categories = [
  ['Moradia', 'expense'], ['Mercado', 'expense'], ['Transporte', 'expense'],
  ['Alimentação', 'expense'], ['Saúde', 'expense'], ['Assinaturas', 'expense'],
  ['Lazer', 'expense'], ['Salário', 'income'], ['Outros', 'expense'], ['Transferência', 'transfer']
];

const demoTransactions = [
  ['Salário', 'Salário', '2026-09-30', 'income', 850000],
  ['Projeto freelance', 'Outros', '2026-09-28', 'income', 45000],
  ['Aluguel', 'Moradia', '2026-09-26', 'expense', 180000],
  ['Feira da semana', 'Mercado', '2026-09-24', 'expense', 76000],
  ['Internet fibra', 'Moradia', '2026-09-21', 'expense', 11990],
  ['Recarga transporte', 'Transporte', '2026-09-19', 'expense', 32500],
  ['Jantar com amigos', 'Alimentação', '2026-09-16', 'expense', 18400],
  ['Streaming', 'Assinaturas', '2026-09-12', 'expense', 4500],
  ['Farmácia', 'Saúde', '2026-09-10', 'expense', 11000],
  ['Conta de luz', 'Moradia', '2026-09-08', 'expense', 22000],
  ['Academia', 'Saúde', '2026-09-05', 'expense', 8900],
  ['Almoço de domingo', 'Alimentação', '2026-09-02', 'expense', 13110]
];

export function createInitialMobileState() {
  const categoryIds = Object.fromEntries(categories.map(([name], index) => [name, index + 1]));
  const accounts = [
    { id: 1, name: 'Conta principal', institution: 'Conta local', type: 'checking', openingBalanceCents: 0, isLiquid: true, status: 'active' },
    { id: 2, name: 'Reserva de emergência', institution: 'Conta local', type: 'reserve', openingBalanceCents: 720000, isLiquid: false, status: 'active' },
    { id: 3, name: 'Poupança', institution: 'Conta local', type: 'savings', openingBalanceCents: 185000, isLiquid: false, status: 'active' },
    { id: 4, name: 'Investimentos', institution: 'Conta local', type: 'investment', openingBalanceCents: 450000, isLiquid: false, status: 'active' }
  ];
  const transactionRows = demoTransactions.map(([description, category, date, type, amountCents], index) => ({
    id: index + 1, description, normalizedMerchant: description, date, dueDate: date,
    purchaseDate: date, type, amountCents, method: 'account', status: 'paid', source: 'manual',
    installmentGroup: null, installmentNumber: 0, installmentCount: 1, accountId: 1,
    categoryId: categoryIds[category], cardId: null, spendingContext: undefined, memo: ''
  }));

  return {
    schemaVersion: 1,
    nextId: 100,
    sessions: [],
    users: [
      { id: 1, username: 'demo-xitolinos', email: 'demo@xitolinos.local', profile: 'owner', passwordSalt: null, passwordDigest: null },
      { id: 2, username: 'consulta-xitolinos', email: 'consulta@xitolinos.local', profile: 'shopping_viewer', passwordSalt: null, passwordDigest: null }
    ],
    accounts,
    categories: categories.map(([name, type], index) => ({ id: index + 1, name, type, status: 'active' })),
    transactions: transactionRows,
    cards: [{ id: 1, name: 'Cartão principal', network: 'Crédito', lastFour: '4242', closingDay: 8, dueDay: 18, limitCents: 1200000, accountId: 1, active: true }],
    recurrences: [
      ['Aluguel', 'Moradia', 180000, 5], ['Conta de energia', 'Moradia', 22000, 8],
      ['Plano de celular', 'Assinaturas', 6990, 11], ['Seguro do veículo', 'Transporte', 14900, 15],
      ['Internet fibra', 'Moradia', 11990, 20], ['Garagem', 'Moradia', 25000, 25]
    ].map(([name, category, amountCents, dayOfMonth], index) => ({
      id: index + 1, name, amountCents, frequency: 'monthly', dayOfMonth,
      startDate: '2026-10-01', method: 'account', active: true, categoryId: categoryIds[category], accountId: 1
    })),
    incomeSources: [
      { id: 1, name: 'Salário mensal', amountCents: 850000, frequency: 'monthly', nextDate: '2026-10-30', dayOfMonth: 30, reminderDaysBefore: 2, alertEnabled: true, active: true, categoryId: categoryIds['Salário'], accountId: 1 },
      { id: 2, name: 'Projeto eventual', amountCents: 45000, frequency: 'once', nextDate: '2026-10-22', dayOfMonth: 22, reminderDaysBefore: 1, alertEnabled: true, active: true, categoryId: categoryIds.Outros, accountId: 1 }
    ],
    reserves: [
      { id: 1, kind: 'emergency', name: 'Reserva de emergência', balanceCents: 720000, targetCents: 1200000, annualYieldBasisPoints: 0, accountId: 2 },
      { id: 2, kind: 'savings', name: 'Poupança', balanceCents: 185000, targetCents: 500000, annualYieldBasisPoints: 500, accountId: 3 },
      { id: 3, kind: 'investment', name: 'Investimentos', balanceCents: 450000, targetCents: 1000000, annualYieldBasisPoints: 700, accountId: 4 }
    ],
    goals: [{ id: 1, name: 'Viagem de férias', targetCents: 500000, savedCents: 185000, dueDate: '2027-07-01' }],
    budgets: [
      ['Moradia', 230000], ['Mercado', 100000], ['Transporte', 50000], ['Alimentação', 50000],
      ['Saúde', 40000], ['Assinaturas', 15000], ['Lazer', 15000]
    ].map(([categoryName, limitCents], index) => ({ id: index + 1, month: '2026-10', limitCents, categoryId: categoryIds[categoryName], categoryName })),
    preferences: { theme: 'light', accent: 'green', minimumReserveCents: 50000, cardStopDaysBefore: 3, closeoutDay: 1 },
    monthCloses: [],
    merchantRules: [],
    desiredPurchases: [],
    shoppingState: { lists: [], stock: [], sharedViewerIds: [2] },
    importBatches: [],
    auditEvents: []
  };
}

export const DEMO_CREDENTIALS = {
  owner: { email: 'demo@xitolinos.local', password: 'Xitolinos-Demo-2026!' },
  shopping: { email: 'consulta@xitolinos.local', password: 'Xitolinos-Demo-2026!' }
};
