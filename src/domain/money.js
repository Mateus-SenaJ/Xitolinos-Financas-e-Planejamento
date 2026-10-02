'use strict';

function parseMoneyToCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Valor monetário inválido.');
    return Math.round((value + Number.EPSILON) * 100);
  }
  if (typeof value !== 'string') throw new TypeError('Valor monetário inválido.');

  const normalized = value.trim().replace(/R\$\s?/i, '').replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) throw new TypeError('Valor monetário inválido.');
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Centavos deve ser um inteiro seguro.');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function sumCents(values) {
  return values.reduce((total, value) => {
    if (!Number.isSafeInteger(value)) throw new TypeError('Centavos deve ser um inteiro seguro.');
    return total + value;
  }, 0);
}

module.exports = { parseMoneyToCents, formatCents, sumCents };