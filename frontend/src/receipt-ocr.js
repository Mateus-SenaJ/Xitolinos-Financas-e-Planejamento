import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_900_000;
const BASE = `${import.meta.env.BASE_URL}ocr/`;
let workerPromise;
let activeProgress;

function validIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateSuggestion(text) {
  const iso = text.match(/\b(20\d{2})-(0?[1-9]|1[0-2])-([0-2]?\d|3[01])\b/);
  const local = text.match(/\b([0-3]?\d)[/.\-]([01]?\d)[/.\-](\d{2,4})\b/);
  if (iso) {
    const value = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    return validIsoDate(value) ? value : '';
  }
  if (!local) return '';
  const year = local[3].length === 2 ? `20${local[3]}` : local[3];
  const value = `${year}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return validIsoDate(value) ? value : '';
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
  for (const line of text.split(/\r?\n/)) {
    let match;
    while ((match = moneyPattern.exec(line))) {
      const amountCents = parseCents(match[1]);
      if (amountCents) candidates.push({ amountCents, priority: /total|valor\s+(?:pago|transferido|da\s+transa[cç][aã]o|da\s+compra)|quantia/i.test(line) ? 1 : 0 });
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || b.amountCents - a.amountCents);
  return candidates[0]?.amountCents || null;
}

export function parseReceiptText(text) {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const transactionCode = source.match(/\bE\d{32}\b/i)?.[0]
    || source.match(/(?:id\s+da\s+transa[cç][aã]o|c[oó]digo\s+(?:da\s+)?transa[cç][aã]o|autentica[cç][aã]o)\s*[:#-]?\s*([A-Z0-9._/-]{6,80})/i)?.[1]
    || '';
  const receiptNumber = source.match(/(?:n[uú]mero\s+do\s+comprovante|n[uú]mero\s+do\s+recibo|comprovante\s+n[ºo.]?|recibo\s+n[ºo.]?)\s*[:#-]?\s*([A-Z0-9._/-]{3,60})/i)?.[1] || '';
  const description = source.split(/\r?\n/).map(line => line.trim()).find(line => line.length >= 3 && line.length <= 100
    && !/^(comprovante|recibo|pix|transfer[eê]ncia|pagamento|data|valor|autentica[cç][aã]o)\b/i.test(line)
    && !/\d{2}[/.\-]\d{2}[/.\-]\d{2,4}/.test(line)) || '';
  return {
    description: description.replace(/\s+/g, ' ').slice(0, 100),
    date: dateSuggestion(source),
    amountCents: amountSuggestion(source),
    transactionCode: transactionCode.slice(0, 80),
    receiptNumber: receiptNumber.slice(0, 60)
  };
}

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('por', 1, {
      workerPath: `${BASE}worker.min.js`,
      corePath: `${BASE}core`,
      langPath: `${BASE}lang`,
      workerBlobURL: false,
      gzip: true,
      logger: message => activeProgress?.(message)
    })).catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível preparar o comprovante.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.82;
  let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  while (blob && blob.size > MAX_ATTACHMENT_BYTES && quality > 0.42) {
    quality -= 0.1;
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  }
  if (!blob || blob.size > MAX_ATTACHMENT_BYTES) throw new Error('A imagem ficou grande demais para guardar. Escolha uma imagem menor.');
  return readAsDataUrl(blob);
}

async function pdfText(file, maximumPages = 3) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = await Promise.all(Array.from({ length: Math.min(pdf.numPages, maximumPages) }, async (_, index) => {
    const page = await pdf.getPage(index + 1);
    const content = await page.getTextContent();
    const lines = [];
    for (const item of content.items.filter(value => value.str?.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
      const y = item.transform[5];
      let line = lines.find(value => Math.abs(value.y - y) < 3);
      if (!line) { line = { y, items: [] }; lines.push(line); }
      line.items.push({ x: item.transform[4], text: item.str.trim() });
    }
    return { page, text: lines.sort((a, b) => b.y - a.y).map(line => line.items.sort((a, b) => a.x - b.x).map(value => value.text).join(' ')).join('\n') };
  }));
  return { pdfjs, pages, pageCount: pdf.numPages };
}

async function recognizePdfPages(pages, worker, onProgress) {
  let text = '';
  let confidence = 0;
  for (const { page } of pages) {
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1.6, 1800 / Math.max(original.width, original.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    const result = await worker.recognize(canvas, {}, { text: true });
    text += `\n${result.data.text}`;
    confidence = Math.max(confidence, Number(result.data.confidence || 0));
    onProgress?.({ status: 'recognizing text', progress: 1 });
    canvas.width = 0;
    canvas.height = 0;
  }
  return { text, confidence };
}

export async function recognizeDocumentText(file, onProgress, { forceOcr = false } = {}) {
  if (!file || file.size > MAX_DOCUMENT_BYTES) throw new Error('O arquivo deve ter até 12 MB.');
  activeProgress = onProgress;
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const worker = await getWorker(onProgress);
    if (isPdf) {
      const { pages, pageCount } = await pdfText(file, 10);
      const text = pages.map(item => item.text).join('\n');
      if (!forceOcr && text.trim().length > 25) return text;
      if (pageCount > pages.length) throw new Error('Este PDF tem mais de 10 páginas. Separe em arquivos menores para manter a leitura local completa.');
      return (await recognizePdfPages(pages, worker, onProgress)).text;
    }
    return (await worker.recognize(file, {}, { text: true })).data.text;
  } finally { activeProgress = null; }
}

export async function readReceipt(file, onProgress) {
  if (!file) throw new Error('Selecione um comprovante.');
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('O comprovante deve ter até 12 MB.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
  if (!isPdf && !isImage) throw new Error('Use uma imagem ou um PDF do comprovante.');

  onProgress?.({ status: 'Preparando leitura local', progress: 0 });
  activeProgress = onProgress;
  try {
    const worker = await getWorker(onProgress);
    let text = '';
    let confidence = 0;
    let source = 'ocr';
    if (isPdf) {
      const { pages, pageCount } = await pdfText(file);
      if (pageCount > 3) throw new Error('Para anexar, use um PDF de até 3 páginas. Separe documentos maiores em partes menores.');
      text = pages.map(item => item.text).join('\n');
      if (text.trim().length < 25) {
        const result = await recognizePdfPages(pages, worker, onProgress);
        text = result.text;
        confidence = result.confidence;
      } else source = 'pdf-text';
    } else {
      const result = await worker.recognize(file, {}, { text: true });
      text = result.data.text;
      confidence = Number(result.data.confidence || 0);
    }
    if (!text.trim()) throw new Error('Não consegui ler o comprovante. Tente uma foto mais nítida e bem iluminada.');
    const attachment = isPdf ? await readAsDataUrl(file) : await compressImage(file);
    const mimeType = isPdf ? 'application/pdf' : 'image/jpeg';
    if (attachment.length > MAX_ATTACHMENT_DATA_URL_LENGTH) throw new Error('O comprovante excede o limite de 2 MB para armazenamento local.');
    return {
      fileName: file.name.slice(0, 180), mimeType, dataUrl: attachment, source,
      confidence: source === 'pdf-text' ? 100 : Math.max(0, Math.min(100, Math.round(confidence))), extracted: parseReceiptText(text)
    };
  } finally { activeProgress = null; }
}
