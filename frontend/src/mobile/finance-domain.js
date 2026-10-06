const dayMs = 86400000;
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function validMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))) throw new Error('Mês inválido. Use AAAA-MM.');
  return value;
}

export const monthKey = value => String(value || '').slice(0, 7);

export function monthDate(month, day) {
  validMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const bounded = Math.min(Math.max(1, Number(day) || 1), lastDay);
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(bounded).padStart(2, '0')}`;
}

export function shiftMonth(month, offset) {
  validMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function normalizeMerchant(value, rules = []) {
  const normalize = input => String(input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const source = normalize(value);
  for (const rule of rules) {
    const alias = normalize(rule.normalizedAlias || rule.alias);
    if (alias && (source === alias || source.startsWith(`${alias} `))) return rule.canonicalName;
  }
  if (source.includes('drogasil')) return 'Farmácia Drogasil';
  if (['ifood', 'restaurante', 'sushi', 'hamburg'].some(term => source.includes(term))) return 'Alimentação';
  const cut = source.search(/\s+(ba|sp|rj|mg|df|salvador|sao paulo|belo horizonte)\b/);
  return (cut > 0 ? source.slice(0, cut) : source).replace(/\b\w/g, char => char.toLocaleUpperCase('pt-BR'));
}

export function installments(amountCents, count) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('O valor precisa ser positivo em centavos.');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Informe de 1 a 60 parcelas.');
  const quotient = Math.floor(amountCents / count);
  const remainder = amountCents % count;
  return Array.from({ length: count }, (_, index) => quotient + (index < remainder ? 1 : 0));
}

export function recurringOccurrences(schedule, month) {
  validMonth(month);
  if (!schedule.active) return [];
  const endOfMonth = monthDate(month, 31);
  if (schedule.endDate && schedule.endDate < `${month}-01`) return [];
  const start = schedule.startDate || schedule.nextDate;
  if (!start) return [];
  if (schedule.frequency === 'once') return monthKey(start) === month ? [start] : [];
  if (schedule.frequency === 'monthly') {
    const day = schedule.dayOfMonth || Number(start.slice(8, 10)) || 1;
    const occurrence = monthDate(month, day);
    const monthGap = (Number(month.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(month.slice(5, 7)) - Number(start.slice(5, 7));
    return monthGap >= 0 && occurrence >= start && occurrence <= endOfMonth && (!schedule.endDate || occurrence <= schedule.endDate) ? [occurrence] : [];
  }
  const interval = schedule.frequency === 'weekly' ? 7 : schedule.frequency === 'fortnightly' ? 14 : 0;
  if (interval) {
    const first = Math.max(Date.parse(`${start}T00:00:00Z`), Date.parse(`${month}-01T00:00:00Z`));
    const last = Date.parse(`${endOfMonth}T00:00:00Z`);
    const result = [];
    for (let timestamp = first; timestamp <= last; timestamp += dayMs) {
      const distance = Math.round((timestamp - Date.parse(`${start}T00:00:00Z`)) / dayMs);
      const date = new Date(timestamp).toISOString().slice(0, 10);
      if (distance >= 0 && distance % interval === 0 && (!schedule.endDate || date <= schedule.endDate)) result.push(date);
    }
    return result;
  }
  if (schedule.frequency === 'yearly') {
    const occurrence = `${month.slice(0, 4)}-${start.slice(5, 7)}-${start.slice(8, 10)}`;
    return occurrence >= start && (!schedule.endDate || occurrence <= schedule.endDate) ? [occurrence] : [];
  }
  return [];
}

export function duplicateKey(row) {
  return [row.date || row.dueDate, Math.abs(Number(row.amountCents)), normalizeMerchant(row.description || row.merchant), row.type || 'expense'].join('|');
}

export function classifyImportedRows(incoming, existing) {
  const fingerprints = new Set(existing.filter(row => row.status !== 'voided').map(duplicateKey));
  const latestDate = existing.reduce((latest, row) => row.date > latest ? row.date : latest, '0000-00-00');
  const duplicates = [];
  const addNow = [];
  const review = [];
  for (const row of incoming) {
    const key = duplicateKey(row);
    if (fingerprints.has(key)) { duplicates.push(row); continue; }
    fingerprints.add(key);
    if (row.date > latestDate) addNow.push(row);
    else review.push(row);
  }
  return { duplicates, addNow, review, latestDate };
}

function flatTransaction(row, state) {
  const category = state.categories.find(item => item.id === row.categoryId);
  const account = state.accounts.find(item => item.id === row.accountId);
  const card = state.cards.find(item => item.id === row.cardId);
  return {
    ...row, category: category?.name || 'Outros', categoryId: category?.id || null,
    accountName: account?.name || '', cardName: card?.name || '', deletedAt: row.deletedAt || null,
    paidAt: row.paidAt || null
  };
}

function projectionsFor(month, state) {
  const result = [];
  for (const item of state.recurrences) for (const date of recurringOccurrences(item, month)) {
    if (state.transactions.some(row => row.recurrenceId === item.id && (row.dueDate || row.date) === date && row.status !== 'voided')) continue;
    const category = state.categories.find(row => row.id === item.categoryId);
    const account = state.accounts.find(row => row.id === item.accountId);
    result.push({
      id: `recurrence-${item.id}-${date}`, description: item.name, type: 'expense', amountCents: item.amountCents,
      date, dueDate: date, method: item.method, status: 'planned', source: 'recurrence', categoryId: item.categoryId,
      category: category?.name || 'Outros', accountId: item.accountId, accountName: account?.name || '',
      recurrenceId: item.id, projected: true
    });
  }
  for (const item of state.incomeSources.filter(row => row.active)) {
    const schedule = { active: item.active, frequency: item.frequency, startDate: item.nextDate, nextDate: item.nextDate, dayOfMonth: item.dayOfMonth || Number(item.nextDate.slice(8, 10)), endDate: item.endDate };
    for (const date of recurringOccurrences(schedule, month)) {
      if (state.transactions.some(row => row.incomeSourceId === item.id && row.date === date && row.status !== 'voided')) continue;
      const category = state.categories.find(row => row.id === item.categoryId);
      const account = state.accounts.find(row => row.id === item.accountId);
      result.push({
        id: `income-${item.id}-${date}`, description: item.name, type: 'income', amountCents: item.amountCents,
        date, dueDate: date, method: 'account', status: 'planned', source: 'income', categoryId: item.categoryId,
        category: category?.name || 'Outros', accountId: item.accountId, accountName: account?.name || '',
        incomeSourceId: item.id, projected: true
      });
    }
  }
  return result;
}

function liquidBalanceBefore(cutoff, accounts, transactions) {
  const liquid = new Set(accounts.filter(item => item.isLiquid && item.status !== 'archived').map(item => item.id));
  let balance = accounts.filter(item => liquid.has(item.id)).reduce((sum, item) => sum + Number(item.openingBalanceCents || 0), 0);
  for (const row of transactions) {
    if (row.status !== 'paid') continue;
    const date = row.paidAt || (row.method === 'card' ? row.dueDate || row.date : row.date);
    if (!date || date >= cutoff) continue;
    if (row.type === 'income' && liquid.has(row.accountId)) balance += row.amountCents;
    if (row.type === 'expense' && liquid.has(row.accountId)) balance -= row.amountCents;
    if (row.type === 'transfer') {
      if (liquid.has(row.accountId)) balance -= row.amountCents;
      if (liquid.has(row.counterpartyAccountId)) balance += row.amountCents;
    }
  }
  return balance;
}

function totalsForMonth(month, transactions, projected, accountBalanceCents = 0) {
  validMonth(month);
  const inMonth = transactions.filter(row => {
    if (row.status === 'voided') return false;
    const basisDate = row.type === 'expense' && row.method === 'card' ? row.dueDate || row.date : row.date;
    return monthKey(basisDate) === month;
  });
  const pending = projected.filter(row => monthKey(row.date) === month);
  const expenses = [...inMonth.filter(row => row.type === 'expense'), ...pending.filter(row => row.type === 'expense')];
  const incomes = [...inMonth.filter(row => row.type === 'income'), ...pending.filter(row => row.type === 'income')];
  const expenseCents = expenses.reduce((sum, row) => sum + row.amountCents, 0);
  const incomeCents = incomes.reduce((sum, row) => sum + row.amountCents, 0);
  return {
    month, nextMonth: shiftMonth(month, 1), expenseCents, incomeCents,
    paidExpenseCents: expenses.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0),
    paidIncomeCents: incomes.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0),
    committedCents: expenses.filter(row => row.status !== 'paid').reduce((sum, row) => sum + row.amountCents, 0),
    projectedEndBalanceCents: accountBalanceCents + incomeCents - expenseCents,
    coverageNeededCents: Math.max(0, expenseCents - incomeCents - accountBalanceCents),
    expenses, incomes,
    expenseExplanation: { label: `Despesas consideradas em ${month}`, valueCents: expenseCents, recordIds: expenses.map(row => row.id).filter(Boolean), source: 'Movimentações com data de pagamento e compromissos recorrentes/cartão previstos' }
  };
}

function categoryTotals(rows) {
  const result = {};
  for (const row of rows.filter(item => item.type === 'expense')) result[row.category || 'Outros'] = (result[row.category || 'Outros'] || 0) + row.amountCents;
  return Object.entries(result).map(([name, amountCents]) => ({ name, amountCents })).sort((a, b) => b.amountCents - a.amountCents);
}

function notificationsFor(state, today, cardAlerts, transactions, currentMonth) {
  const daysBetween = target => Math.ceil((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs);
  const notifications = cardAlerts.filter(item => item.daysUntilClosing <= Number(state.preferences.cardStopDaysBefore ?? 3)).map(item => ({
    id: `closing-${item.cardId}`, kind: 'card-closing', title: `Fechamento do ${item.cardName}`, message: item.message, month: currentMonth
  }));
  for (const card of state.cards.filter(item => item.active)) {
    const invoiceRows = transactions.filter(row => row.cardId === card.id && row.status !== 'voided' && monthKey(row.dueDate || row.date) === currentMonth);
    const invoiceCents = invoiceRows.reduce((sum, row) => sum + row.amountCents, 0);
    const paidCents = invoiceRows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0);
    const endDay = new Date(Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)), 0)).getUTCDate();
    const dueDate = `${currentMonth}-${String(Math.min(card.dueDay, endDay)).padStart(2, '0')}`;
    const daysUntil = daysBetween(dueDate);
    if (invoiceCents > paidCents && daysUntil <= 3) notifications.push({
      id: `invoice-${card.id}-${currentMonth}`, kind: 'card-due', title: `Fatura do ${card.name}`,
      message: `${daysUntil < 0 ? 'Venceu' : 'Vence'} em ${dueDate.slice(-2)}/${currentMonth.slice(5, 7)}; ainda consta valor em aberto.`, month: currentMonth
    });
  }
  for (const item of state.incomeSources.filter(row => row.active && row.alertEnabled)) {
    if (daysBetween(item.nextDate) <= Number(item.reminderDaysBefore || 0)) notifications.push({
      id: `income-${item.id}-${item.nextDate}`, kind: 'income-due', title: `Acompanhe ${item.name}`,
      message: `Recebimento previsto para ${item.nextDate.slice(-2)}/${item.nextDate.slice(5, 7)}.`, month: monthKey(item.nextDate)
    });
  }
  const priorMonth = shiftMonth(currentMonth, -1);
  const day = Number(today.slice(8, 10));
  if (day >= Number(state.preferences.closeoutDay || 1) && !state.monthCloses.some(item => item.month === priorMonth)) notifications.push({
    id: `close-${priorMonth}`, kind: 'month-close', title: `Feche ${priorMonth}`,
    message: 'Confirme o pagamento das faturas e registre a cobertura do mês.', month: priorMonth
  });
  return notifications;
}

export function buildMobileDashboard(state, selectedMonth, today = localToday()) {
  const month = validMonth(selectedMonth || today.slice(0, 7));
  const transactions = state.transactions.map(row => flatTransaction(row, state));
  const currentMonth = today.slice(0, 7);
  const ranges = Array.from({ length: 19 }, (_, index) => shiftMonth(currentMonth, index - 12));
  if (!ranges.includes(month)) ranges.push(month);
  ranges.sort();
  const monthSummaries = ranges.map(period => {
    const summary = totalsForMonth(period, transactions, projectionsFor(period, state), liquidBalanceBefore(`${period}-01`, state.accounts, state.transactions));
    return {
      month: period, expenseCents: summary.expenseCents, incomeCents: summary.incomeCents,
      committedCents: summary.committedCents, coverageNeededCents: summary.coverageNeededCents,
      projectedEndBalanceCents: summary.projectedEndBalanceCents, paidExpenseCents: summary.paidExpenseCents,
      paidIncomeCents: summary.paidIncomeCents, expenseCount: summary.expenses.length, hasDeficit: summary.coverageNeededCents > 0
    };
  });
  const summary = totalsForMonth(month, transactions, projectionsFor(month, state), liquidBalanceBefore(`${month}-01`, state.accounts, state.transactions));
  const rows = [...summary.expenses, ...summary.incomes].sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
  const monthBudgets = state.budgets.filter(item => item.month === month);
  const used = {};
  for (const row of summary.expenses) used[row.category] = (used[row.category] || 0) + row.amountCents;
  const cardInvoices = state.cards.map(card => {
    const lineItems = transactions.filter(row => row.cardId === card.id && row.status !== 'voided' && monthKey(row.dueDate || row.date) === month);
    return { ...card, invoiceCents: lineItems.reduce((sum, row) => sum + row.amountCents, 0), paidCents: lineItems.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0), lineItems };
  });
  const currentCashCents = liquidBalanceBefore(`${shiftMonth(currentMonth, 1)}-01`, state.accounts, state.transactions);
  const cardAlerts = state.cards.filter(card => card.active).map(card => {
    const closingMonth = card.closingDay >= Number(today.slice(8, 10)) ? currentMonth : shiftMonth(currentMonth, 1);
    const closingDate = monthDate(closingMonth, card.closingDay);
    const daysUntilClosing = Math.ceil((Date.parse(`${closingDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs);
    return { cardId: card.id, cardName: card.name, closingDay: card.closingDay, dueDay: card.dueDay, daysUntilClosing, message: daysUntilClosing <= Number(state.preferences.cardStopDaysBefore ?? 3) ? `A fatura fecha em ${card.closingDay}; novas compras entram no próximo ciclo.` : `A fatura fecha no dia ${card.closingDay} e vence no dia ${card.dueDay}.` };
  });
  const foodBudget = monthBudgets.find(item => /aliment|restaur|delivery/i.test(normalizeMerchant(item.categoryName)));
  const availableForDeliveryCents = Math.max(0, summary.projectedEndBalanceCents - Number(state.preferences.minimumReserveCents || 0));
  const deliveryBudgetRemainderCents = foodBudget ? Math.max(0, foodBudget.limitCents - Number(used[foodBudget.categoryName] || 0)) : availableForDeliveryCents;
  const emergencyReserveCents = Number(state.reserves.find(item => item.kind === 'emergency')?.balanceCents || 0);
  const completedMonths = monthSummaries.filter(item => item.month < currentMonth && item.expenseCents > 0).slice(-3);
  const monthlyExpenseBaselineCents = completedMonths.length ? Math.round(completedMonths.reduce((sum, item) => sum + item.expenseCents, 0) / completedMonths.length) : state.recurrences.filter(item => item.active && item.frequency === 'monthly').reduce((sum, item) => sum + item.amountCents, 0);
  const close = state.monthCloses.find(item => item.month === month) || null;
  return {
    month, currentMonth, nextMonth: shiftMonth(currentMonth, 1), currentCashCents,
    totals: summary, details: rows, categoryTotals: categoryTotals(summary.expenses),
    budgets: monthBudgets.map(item => ({ ...item, usedCents: used[item.categoryName] || 0 })),
    accounts: state.accounts, categories: state.categories, cards: cardInvoices, recurrences: state.recurrences,
    incomeSources: state.incomeSources, reserves: state.reserves, goals: state.goals, preferences: state.preferences,
    monthSummaries, close, cardAlerts, notifications: notificationsFor(state, today, cardAlerts, transactions, currentMonth),
    deliverySpending: categoryTotals(transactions.filter(row => row.date >= `${currentMonth}-01` && row.date <= today)),
    deliveryRecommendation: { month, maximumAmountCents: Math.min(availableForDeliveryCents, deliveryBudgetRemainderCents), foodBudgetRemainderCents: foodBudget ? deliveryBudgetRemainderCents : null, minimumReserveCents: Number(state.preferences.minimumReserveCents || 0) },
    reserveSummary: { totalCents: state.reserves.reduce((sum, item) => sum + Number(item.balanceCents || 0), 0), emergencyBalanceCents: emergencyReserveCents, averageMonthlyExpenseCents: monthlyExpenseBaselineCents, emergencyCoverageMonths: monthlyExpenseBaselineCents ? Number((emergencyReserveCents / monthlyExpenseBaselineCents).toFixed(1)) : 0, recommendedCoverageMonths: 6 },
    explanation: summary.expenseExplanation
  };
}
