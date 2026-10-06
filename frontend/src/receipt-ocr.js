import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseReceiptText } from './receipt-parser.js';

const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 2_900_000;
const BASE = `${import.meta.env.BASE_URL}ocr/`;
let workerPromise;
let activeProgress;

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
