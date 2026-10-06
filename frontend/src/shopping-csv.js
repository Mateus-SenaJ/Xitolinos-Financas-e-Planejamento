export function parseLocalCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const source = String(text).replace(/^\uFEFF/, '');
  const separators = { ',': 0, ';': 0 };
  let headerQuoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && headerQuoted && source[index + 1] === '"') index += 1;
    else if (char === '"') headerQuoted = !headerQuoted;
    else if (!headerQuoted && (char === '\n' || char === '\r')) break;
    else if (!headerQuoted && (char === ',' || char === ';')) separators[char] += 1;
  }
  const delimiter = separators[';'] > separators[','] ? ';' : ',';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && source[index + 1] === '\n') index += 1; row.push(cell); if (row.some(value => value.trim())) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export function toShoppingCsv(list) {
  return [
    ['name', 'section', 'quantity', 'unit', 'estimatedCents', 'paidCents', 'status'],
    ...list.items.map(item => [item.name, item.section, item.quantityMilli / 1000, item.unit, item.estimatedCents, item.paidCents, item.status])
  ].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
}
