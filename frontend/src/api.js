import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const apiBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:1337';
const androidBuild = import.meta.env.MODE === 'android';

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${apiBase}/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || 'Não foi possível completar essa operação.');
  return data;
}

export async function authenticateDevice(token) {
  if (androidBuild) {
    const status = await api('/finance/security/status', { token, sensitive: false });
    if (!status.enabled) return { enabled: false };
    await authenticateNativeBiometry('Confirme o acesso ao seu planejamento financeiro.');
    return { enabled: true, proof: 'native' };
  }
  const status = await request('/finance/security/status', { token });
  if (!status.enabled) return { enabled: false };
  const { enabled, options } = await request('/finance/security/authentication/options', { token });
  if (!enabled) return { enabled: false };
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const credential = await startAuthentication({ optionsJSON: options });
  const result = await request('/finance/security/authentication/verify', { token, method: 'POST', body: JSON.stringify({ credential }) });
  return { enabled: true, proof: result.proof };
}

export async function api(path, { token, sensitive = true, ...options } = {}) {
  if (androidBuild) {
    const { api: mobileApi } = await import('./mobile/api.js');
    const method = String(options.method || 'GET').toUpperCase();
    const requiresConfirmation = sensitive && token && (method !== 'GET' || path.startsWith('/finance/export'));
    if (requiresConfirmation) {
      const status = await mobileApi('/finance/security/status', { token, sensitive: false });
      if (status.enabled) await authenticateDevice(token);
    }
    return mobileApi(path, { token, sensitive, ...options });
  }
  const method = String(options.method || 'GET').toUpperCase();
  const needsDeviceConfirmation = sensitive && token && (method !== 'GET' || path.startsWith('/finance/export'));
  if (needsDeviceConfirmation) {
    const status = await request('/finance/security/status', { token });
    if (status.enabled) {
      const verified = await authenticateDevice(token);
      options.headers = { ...options.headers, 'X-Sensitive-Proof': verified.proof };
    }
  }
  return request(path, { token, ...options });
}

export async function login(identifier, password) {
  if (androidBuild) {
    const { login: mobileLogin } = await import('./mobile/api.js');
    return mobileLogin(identifier, password);
  }
  const response = await fetch(`${apiBase}/api/auth/local`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Confira o usuário e a senha.');
  return { token: data.jwt, user: data.user };
}

export async function checkNativeBiometry() {
  if (!androidBuild) return { isAvailable: false, reason: 'Este recurso está disponível no aplicativo Android.' };
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  return BiometricAuth.checkBiometry();
}

export async function authenticateNativeBiometry(reason = 'Confirme sua identidade para continuar.') {
  if (!androidBuild) throw new Error('A biometria nativa está disponível somente no aplicativo Android.');
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  await BiometricAuth.authenticate({
    reason,
    allowDeviceCredential: true,
    androidTitle: 'Acesso protegido',
    androidSubtitle: 'Autentique-se para continuar'
  });
}

export async function saveLocalFile(fileName, content, mimeType) {
  if (!androidBuild) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const safeName = String(fileName).replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const file = await Filesystem.writeFile({
    path: `exports/${Date.now()}-${safeName}`,
    data: String(content),
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true
  });
  await Share.share({ title: fileName, text: 'Arquivo exportado localmente pelo Xitolinos.', files: [file.uri], dialogTitle: 'Compartilhar arquivo' });
}

export async function parseStatement(file) {
  const fileName = file.name.toLocaleLowerCase('pt-BR');
  if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(fileName)) {
    throw new Error('Extratos em imagem não podem ser lidos neste modo offline. O OCR local ainda não está disponível; use CSV ou PDF com texto selecionável.');
  }
  if (fileName.endsWith('.json')) {
    const parsed = JSON.parse(await file.text());
    return Array.isArray(parsed) ? parsed : parsed.rows || [];
  }
  const text = file.type === 'application/pdf' || fileName.endsWith('.pdf')
    ? await readPdf(file)
    : await file.text();
  if (!text.trim()) throw new Error('Nenhum texto foi encontrado. PDFs digitalizados como imagem exigem OCR local, que ainda não está disponível.');
  return parseStatementText(text);
}

async function readPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const page = await document.getPage(index + 1);
    const content = await page.getTextContent();
    return content.items.map(item => item.str).join(' ');
  }));
  return pages.join('\n');
}

export function parseStatementText(text) {
  return String(text).split(/\r?\n/).map(line => {
    const match = line.match(/(\d{2}[/.]\d{2}(?:[/.]\d{2,4})?)\s+(.+?)\s+(?:R\$\s*)?(-?[\d.]+,\d{2})\s*$/i);
    if (!match) return null;
    const [day, month, year] = match[1].split(/[/.]/);
    const date = `${year ? (year.length === 2 ? `20${year}` : year) : new Date().getFullYear()}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const amountCents = Math.round(Math.abs(Number(match[3].replaceAll('.', '').replace(',', '.')) * 100));
    return { date, description: match[2].trim().slice(0, 120), amountCents, type: match[3].startsWith('-') ? 'income' : 'expense', method: 'account' };
  }).filter(row => row && row.amountCents > 0);
}
