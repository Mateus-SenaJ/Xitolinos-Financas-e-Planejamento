export function parseMoneyToCents(value) {
  const input = String(value ?? '').trim().replace(/[\sR$]/gi, '');
  if (!input) throw new Error('Informe um valor.');
  if (!/^[+-]?[\d.,]+$/.test(input)) throw new Error('Use somente números e separador decimal.');

  const sign = input.startsWith('-') ? -1 : 1;
  const unsigned = input.replace(/^[+-]/, '');
  const comma = unsigned.lastIndexOf(',');
  const dot = unsigned.lastIndexOf('.');
  let normalized;

  if (comma >= 0 && dot >= 0) {
    const decimal = Math.max(comma, dot);
    const fraction = unsigned.slice(decimal + 1);
    normalized = `${unsigned.slice(0, decimal).replace(/[.,]/g, '')}.${fraction}`;
  } else if (comma >= 0) {
    normalized = unsigned.replace(/,/g, '.');
  } else if (dot >= 0) {
    const separators = (unsigned.match(/\./g) || []).length;
    const fraction = unsigned.slice(dot + 1);
    normalized = separators > 1 || fraction.length === 3
      ? unsigned.replace(/\./g, '')
      : unsigned;
  } else normalized = unsigned;

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Informe no máximo duas casas decimais.');
  const cents = Math.round(Number(normalized) * 100) * sign;
  if (!Number.isSafeInteger(cents)) throw new Error('Esse valor excede o limite aceito.');
  return cents;
}

export function formatCentsForInput(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace('.', ',');
}

export function formatMoneyEntry(value) {
  const input = String(value ?? '');
  if (/[-\u2212]/.test(input)) return input;
  const digits = input.replace(/\D/g, '').slice(0, 15);
  if (!digits) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(digits) / 100);
}

export function formatNonNegativeMoneyEntry(value) {
  const input = String(value ?? '');
  return /[-\u2212]/.test(input) ? input : formatMoneyEntry(input);
}

export function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
