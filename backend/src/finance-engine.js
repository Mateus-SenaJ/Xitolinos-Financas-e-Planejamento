'use strict';

const DAY_MS = 86400000;

function validMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')) throw new Error('Mês inválido. Use AAAA-MM.');
  return value;
}

function monthKey(dateValue) {
  return String(dateValue).slice(0, 7);
}

function monthDate(month, day) {
  validMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const boundedDay = Math.min(Math.max(1, Number(day) || 1), new Date(Date.UTC(year, monthNumber, 0)).getUTCDate());
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(boundedDay).padStart(2, '0')}`;
}

function shiftMonth(month, offset) {
  validMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMerchant(value, rules = []) {
  const source = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const rule of rules) {
    const alias = String(rule.normalizedAlias || rule.alias || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (alias && (source === alias || source.startsWith(`${alias} `))) return rule.canonicalName;
  }
  if (source.includes('drogasil')) return 'Farmácia Drogasil';
  if (source.includes('ifood') || source.includes('restaurante') || source.includes('sushi') || source.includes('hamburg')) return 'Alimentação';
  const cut = source.search(/\s+(ba|sp|rj|mg|df|salvador|sao paulo|belo horizonte)\b/);
  return (cut > 0 ? source.slice(0, cut) : source).replace(/\b\w/g, char => char.toLocaleUpperCase('pt-BR'));
}

function installments(amountCents, count) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('O valor precisa ser positivo em centavos.');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error('Informe de 1 a 60 parcelas.');
  const quotient = Math.floor(amountCents / count);
  const remainder = amountCents % count;
  return Array.from({ length: count }, (_, index) => quotient + (index < remainder ? 1 : 0));
}

function recurringOccurrences(schedule, month) {
  validMonth(month);
  if (!schedule.active) return [];
  const [year, monthNumber] = month.split('-').map(Number);
  const endOfMonth = monthDate(month, 31);
  if (schedule.endDate && schedule.endDate < `${month}-01`) return [];
  const start = schedule.startDate || schedule.nextDate;
  if (schedule.frequency === 'once') return start && monthKey(start) === month ? [start] : [];
  const result = [];
  if (schedule.frequency === 'monthly') {
    const day = schedule.dayOfMonth || Number(String(start).slice(8, 10)) || 1;
    const occurrence = monthDate(month, day);
    const monthGap = (year - Number(String(start).slice(0, 4))) * 12 + monthNumber - Number(String(start).slice(5, 7));
    if (monthGap >= 0 && occurrence >= start && occurrence <= endOfMonth && (!schedule.endDate || occurrence <= schedule.endDate)) result.push(occurrence);
    return result;
  }
  const days = schedule.frequency === 'weekly' ? 7 : schedule.frequency === 'fortnightly' ? 14 : 0;
  if (days) {
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const monthEnd = new Date(`${monthDate(month, 31)}T00:00:00Z`);
    const startDate = new Date(`${start}T00:00:00Z`);
    for (let timestamp = Math.max(startDate.getTime(), monthStart.getTime()); timestamp <= monthEnd.getTime(); timestamp += DAY_MS) {
      const distance = Math.round((timestamp - startDate.getTime()) / DAY_MS);
      if (distance >= 0 && distance % days === 0) result.push(new Date(timestamp).toISOString().slice(0, 10));
    }
  } else if (schedule.frequency === 'yearly') {
    const occurrence = `${year}-${String(Number(String(start).slice(5, 7))).padStart(2, '0')}-${String(Number(String(start).slice(8, 10))).padStart(2, '0')}`;
    if (occurrence >= start && (!schedule.endDate || occurrence <= schedule.endDate)) result.push(occurrence);
  }
  return result;
}

function duplicateKey(row) {
  return [row.date || row.dueDate, Math.abs(Number(row.amountCents)), normalizeMerchant(row.description || row.merchant), row.type || 'expense'].join('|');
}

function classifyImportedRows(incoming, existing) {
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

function totalsForMonth({ month, transactions, projected = [], accountBalanceCents = 0, futureIncome = 0 }) {
  validMonth(month);
  const startDate = `${month}-01`;
  const nextMonth = shiftMonth(month, 1);
  const inMonth = transactions.filter(row => {
    if (row.status === 'voided') return false;
    const basisDate = row.type === 'expense' && row.method === 'card' ? row.dueDate || row.date : row.date;
    return monthKey(basisDate) === month;
  });
  const pending = projected.filter(row => monthKey(row.date) === month);
  const expenses = [...inMonth.filter(row => row.type === 'expense'), ...pending.filter(row => row.type === 'expense')];
  const incomes = [...inMonth.filter(row => row.type === 'income'), ...pending.filter(row => row.type === 'income')];
  const expenseCents = expenses.reduce((sum, row) => sum + row.amountCents, 0);
  const incomeCents = incomes.reduce((sum, row) => sum + row.amountCents, 0) + futureIncome;
  const paidExpenseCents = expenses.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0);
  const paidIncomeCents = incomes.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountCents, 0);
  const projectedEndBalanceCents = accountBalanceCents + incomeCents - expenseCents;
  const coverageNeededCents = Math.max(0, expenseCents - incomeCents - accountBalanceCents);
  return {
    month, nextMonth, expenseCents, incomeCents, paidExpenseCents, paidIncomeCents,
    committedCents: expenses.filter(row => row.status !== 'paid').reduce((sum, row) => sum + row.amountCents, 0),
    projectedEndBalanceCents, coverageNeededCents, expenses, incomes,
    expenseExplanation: { label: `Despesas consideradas em ${month}`, valueCents: expenseCents, recordIds: expenses.map(row => row.id).filter(Boolean), source: 'Movimentações com data de pagamento e compromissos recorrentes/cartão previstos' }
  };
}

module.exports = { validMonth, monthKey, monthDate, shiftMonth, normalizeMerchant, installments, recurringOccurrences, duplicateKey, classifyImportedRows, totalsForMonth };
