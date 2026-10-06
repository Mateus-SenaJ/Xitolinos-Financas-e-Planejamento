function validIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateSuggestion(text) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const writtenMonths = { janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
  const formats = [
    { pattern: /\b(20\d{2})-(0?[1-9]|1[0-2])-([0-2]?\d|3[01])\b/gi, parse: match => match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0') },
    { pattern: /\b([0-3]?\d)[/.\-]([01]?\d)[/.\-](\d{2,4})\b/g, parse: match => (match[3].length === 2 ? '20' + match[3] : match[3]) + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0') },
    { pattern: /\b([0-3]?\d)\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(20\d{2})\b/gi, parse: match => match[3] + '-' + writtenMonths[match[2].toLowerCase()] + '-' + match[1].padStart(2, '0') }
  ];
  const candidates = formats.flatMap(({ pattern, parse }) => [...normalized.matchAll(pattern)].map(match => ({ index: match.index, value: parse(match) })))
    .filter(candidate => validIsoDate(candidate.value))
    .sort((a, b) => a.index - b.index);
  return candidates[0]?.value || '';
}

function parseCents(raw) {
  const value = String(raw).replace(/\s/g, '');
  const normalized = value.includes(',')
    ? value.replaceAll('.', '').replace(',', '.')
    : value.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
}

function amountSuggestion(text) {
  const candidates = [];
  const moneyPattern = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi;
  const lines = text.split(/\r?\n/);
  const valueLabel = /\b(subtotal|valor\s+(?:total|final|a\s+pagar)|total(?:\s+(?:geral|final|a\s+pagar|da\s+compra))?|quantia|valor(?!\s+disponivel)|saldo\s+(?:disponivel|anterior|atual|final)|valor\s+(?:pago|transferido|da\s+transacao|da\s+compra|do\s+resgate))\b/gi;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const previousLine = lines[index - 1] || '';
    const context = previousLine + '\n' + line;
    let match;
    while ((match = moneyPattern.exec(line))) {
      const amountCents = parseCents(match[1]);
      if (amountCents) {
        const amountPosition = previousLine.length + 1 + match.index;
        const nearbyLabel = [...context.matchAll(valueLabel)]
          .filter(label => label.index + label[0].length <= amountPosition && amountPosition - label.index <= 120)
          .at(-1);
        const labelText = nearbyLabel?.[1]?.toLowerCase() || '';
        const priority = labelText === 'subtotal' || labelText.startsWith('saldo ') ? -1
          : /^(?:total\b|valor\s+(?:total|final|a\s+pagar))/.test(labelText) ? 3
            : labelText ? 2 : 0;
        candidates.push({ amountCents, priority });
      }
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || b.amountCents - a.amountCents);
  return candidates[0]?.amountCents || null;
}

function transactionCodeSuggestion(text) {
  const lines = text.split(/\r?\n/);
  const labelPattern = /\b(?:id\s+da\s+(?:transacao|operacao)|codigo\s+(?:da\s+)?(?:transacao|operacao))\b/i;
  const fieldHeading = /^(?:produto|valor|data|emissor|banco|conta|autenticacao|comprovante|recibo|pagamento|transferencia|pix)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    const label = lines[index].match(labelPattern);
    if (!label) continue;
    const inlineValue = lines[index].slice(label.index + label[0].length).replace(/^[\s:#-]+/, '').trim();
    const candidate = inlineValue || (lines[index + 1] || '').trim();
    if (fieldHeading.test(candidate)) continue;
    const code = candidate.match(/^([A-Z0-9._/-]{6,80})$/i)?.[1];
    if (code) return code;
  }
  return '';
}

function authenticationSuggestion(text) {
  const lines = text.split(/\r?\n/);
  const labelPattern = /\bautenticacao\b/i;
  const lineIndex = lines.findIndex(line => labelPattern.test(line));
  if (lineIndex < 0) return '';
  const label = lines[lineIndex].match(labelPattern);
  const firstLine = lines[lineIndex].slice(label.index + label[0].length).replace(/^[\s:#-]+/, '');
  const segments = [];
  let length = 0;
  for (const candidate of [firstLine, ...lines.slice(lineIndex + 1, lineIndex + 4)]) {
    if (!candidate.trim()) continue;
    const token = candidate.trim().match(/^([a-f\d]{16,80})$/i)?.[1];
    if (!token) break;
    segments.push(token);
    length += token.length;
    if (length >= 80) break;
  }
  const code = segments.join('');
  return /^[a-f\d]{32,80}$/i.test(code) ? code : '';
}

export function parseReceiptText(text) {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const normalizedSource = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const authentication = authenticationSuggestion(normalizedSource);
  const labeledTransaction = transactionCodeSuggestion(normalizedSource);
  const transactionCode = source.match(/\bE\d{32}\b/i)?.[0]
    || labeledTransaction
    || authentication
    || source.match(/autentica[cç][aã]o\s*[:#-]?\s*([A-Z0-9._/-]{6,80})/i)?.[1]
    || source.match(/\b[A-Z0-9]{32}\b/i)?.[0]
    || '';
  const receiptNumber = source.match(/(?:n[uú]mero\s+do\s+comprovante|n[uú]mero\s+do\s+recibo|comprovante\s+n[ºo.]?|recibo\s+n[ºo.]?)\s*[:#-]?\s*([A-Z0-9._/-]{3,60})/i)?.[1] || '';
  const lines = source.split(/\r?\n/).map(line => line.trim());
  const productCandidate = source.match(/produto[ \t]*:?[ \t]*(?:\r?\n[ \t]*)?([^\r\n]{3,100})/i)?.[1]?.trim() || '';
  const normalizedProduct = productCandidate.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const product = productCandidate && !/^(?:valor|data|emissor|id|codigo|banco|conta|pagamento|transferencia|comprovante|recibo)\b/i.test(normalizedProduct) ? productCandidate : '';
  const debitedAccountIndex = lines.findIndex(line => /conta\s+debitada/i.test(line));
  const descriptionLines = lines.slice(0, debitedAccountIndex >= 0 ? debitedAccountIndex : lines.length);
  const merchantName = /^(?:[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]{2,}(?:\s+(?:(?:de|da|do|das|dos|e)\s+)?[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]{2,})*|[A-ZÀ-ÖØ-Þ\d]{2,}(?:[ \t&.'-]+[A-ZÀ-ÖØ-Þ\d]{2,})+|[a-z][A-Z][A-Za-z]{1,})$/;
  const description = product || descriptionLines.find(line => line.length >= 3 && line.length <= 100
    && ((line.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length >= 2 || debitedAccountIndex >= 0 && merchantName.test(line))
    && (debitedAccountIndex < 0 || merchantName.test(line))
    && !/^(comprovante|recibo|pix|transfer[eê]ncia|pagamento|informa[cç][oõ]es?\s+de\s+pagamento|pagamento\s+(?:efetuado|confirmado)|dados\s+(?:do|de)\s+pagamento|agendamento\s+de\s+resgate|produto|emissor|pago\s+via|banco\s+c6|c6\s*bank|conta\s+debitada|data|valor|autentica[cç][aã]o|c[oó]digo|id\s+da\s+opera[cç][aã]o)\b/i.test(line)
    && !/^(?:R\$\s*)?[\d.,]+$/.test(line)
    && !/^[A-F\d]{16,}$/i.test(line)
    && !/\d{2}[/.\-]\d{2}[/.\-]\d{2,4}/.test(line)) || '';
  const labeledDateText = normalizedSource.match(/(?:data\s+(?:do\s+resgate|(?:do|da|de)\s+(?:pagamento|transferencia|transacao|compra))|pagamento\s+(?:efetuado|confirmado)\s+em)\s*[:#-]?\s*([\s\S]{0,100})/i)?.[1] || '';
  return {
    description: description.replace(/\s+/g, ' ').slice(0, 100),
    date: dateSuggestion(labeledDateText) || dateSuggestion(normalizedSource),
    amountCents: amountSuggestion(normalizedSource),
    transactionCode: transactionCode.slice(0, 80),
    receiptNumber: receiptNumber.slice(0, 60)
  };
}
