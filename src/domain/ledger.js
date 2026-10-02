'use strict';

function calculateLedger(state, month) {
  const accounts = state.accounts.map(account => {
    const entries = state.transactions.filter(transaction =>
      transaction.date <= month.end &&
      (transaction.accountId === account.id || transaction.counterpartyAccountId === account.id)
    );
    const balanceCents = entries.reduce((balance, transaction) => {
      if (transaction.type === 'income' && transaction.accountId === account.id) return balance + transaction.amountCents;
      if (transaction.type === 'expense' && transaction.accountId === account.id) return balance - transaction.amountCents;
      if (transaction.type === 'transfer' && transaction.accountId === account.id) return balance - transaction.amountCents;
      if (transaction.type === 'transfer' && transaction.counterpartyAccountId === account.id) return balance + transaction.amountCents;
      return balance;
    }, account.openingBalanceCents);
    return { ...account, balanceCents };
  });

  const periodTransactions = state.transactions.filter(transaction => transaction.date >= month.start && transaction.date <= month.end);
  const income = periodTransactions.filter(transaction => transaction.type === 'income');
  const expenses = periodTransactions.filter(transaction => transaction.type === 'expense');
  const incomeCents = income.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const expenseCents = expenses.reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const netBalanceCents = accounts.filter(account => account.isLiquid).reduce((sum, account) => sum + account.balanceCents, 0);
  const budgetUsageCents = Object.fromEntries(state.budgets.map(budget => {
    const matchingCategories = budget.category === 'Lazer e outros' ? ['Lazer', 'Outros'] : [budget.category];
    const records = expenses.filter(transaction => matchingCategories.includes(transaction.category));
    return [budget.category, records.reduce((sum, transaction) => sum + transaction.amountCents, 0)];
  }));
  const liquidAccountIds = new Set(accounts.filter(account => account.isLiquid).map(account => account.id));
  const balanceRecords = accounts.filter(account => account.isLiquid).map(account => ({
    id: account.id, description: `Saldo inicial · ${account.name}`, date: month.start,
    amountCents: account.openingBalanceCents, effectCents: account.openingBalanceCents, sourceType: 'opening_balance'
  }));
  for (const transaction of state.transactions.filter(item => item.date <= month.end)) {
    let effectCents = 0;
    if (transaction.type === 'income' && liquidAccountIds.has(transaction.accountId)) effectCents = transaction.amountCents;
    if (transaction.type === 'expense' && liquidAccountIds.has(transaction.accountId)) effectCents = -transaction.amountCents;
    if (transaction.type === 'transfer') {
      if (liquidAccountIds.has(transaction.accountId)) effectCents -= transaction.amountCents;
      if (liquidAccountIds.has(transaction.counterpartyAccountId)) effectCents += transaction.amountCents;
    }
    if (effectCents !== 0) balanceRecords.push({ ...transaction, effectCents, sourceType: 'transaction' });
  }

  return {
    accounts,
    totals: {
      month: month.key,
      incomeCents,
      expenseCents,
      netBalanceCents,
      budgetUsageCents,
      incomeExplanation: explain('Entradas no período', incomeCents, income),
      expenseExplanation: explain('Saídas no período', expenseCents, expenses),
      balanceExplanation: explain('Saldo das contas líquidas', netBalanceCents, balanceRecords)
    }
  };
}

function explain(label, valueCents, records) {
  return {
    label,
    valueCents,
    source: 'transactions_and_accounts',
    records: records.map(record => ({ id: record.id, description: record.description, date: record.date, amountCents: record.amountCents, effectCents: record.effectCents ?? record.amountCents, sourceType: record.sourceType || 'transaction' }))
  };
}

function currentMonth(clock) {
  const today = clock();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const key = `${year}-${month}`;
  return { key, start: `${key}-01`, end: `${key}-${day}` };
}

module.exports = { calculateLedger, currentMonth };