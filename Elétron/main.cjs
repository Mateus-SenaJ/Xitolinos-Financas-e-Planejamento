'use strict';

const { app, BrowserWindow, dialog, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

app.setName('Xitolinos Planejamento');
if (process.platform === 'win32' && process.env.LOCALAPPDATA) app.setPath('userData', path.join(process.env.LOCALAPPDATA, 'Xitolinos Planejamento'));
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

let windowRef;
let localServer;
let isClosing = false;
const projectRoot = app.isPackaged ? path.join(process.resourcesPath, 'xitolinos') : path.resolve(__dirname, '..');
const appData = app.getPath('userData');
const logStream = app.isPackaged ? fs.createWriteStream(path.join(appData, 'desktop.log'), { flags: 'a' }) : 'inherit';

function isAllowedLocalUrl(value) {
  try {
    const address = new URL(value);
    return (address.protocol === 'http:' && ((address.hostname === '127.0.0.1' && ['5173', '1337'].includes(address.port))))
      || (address.protocol === 'ws:' && address.hostname === '127.0.0.1' && address.port === '5173');
  } catch { return value.startsWith('file:'); }
}

async function waitForService(url) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (localServer?.exitCode !== null && localServer?.exitCode !== undefined) throw new Error('Os serviços locais encerraram. Consulte a documentação de execução.');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (response.status < 500) return; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  throw new Error('O aplicativo local não iniciou dentro do tempo esperado. Confira o MySQL local e o arquivo desktop.log.');
}

async function startLocalServices() {
  const runner = path.join(projectRoot, 'scripts', 'dev.js');
  const runtime = app.isPackaged ? path.join(projectRoot, 'runtime', 'node.exe') : process.execPath;
  if (!fs.existsSync(runner) || !fs.existsSync(runtime)) throw new Error('Os arquivos locais do Xitolinos não foram encontrados. Reinstale o aplicativo.');
  const environment = { ...process.env, XITOLINOS_PACKAGED: app.isPackaged ? '1' : '0' };
  if (app.isPackaged) environment.XITOLINOS_DATA_DIR = appData;
  else environment.ELECTRON_RUN_AS_NODE = '1';
  localServer = spawn(runtime, [runner], { cwd: projectRoot, env: environment, stdio: app.isPackaged ? ['ignore', logStream, logStream] : 'inherit', windowsHide: true });
  localServer.on('error', error => { if (!isClosing) dialog.showErrorBox('Xitolinos Planejamento', `Não foi possível iniciar os serviços locais.\n\n${error.message}`); });
  await waitForService('http://127.0.0.1:5173/');
  await waitForService('http://127.0.0.1:1337/api/auth/local');
}

async function openWindow() {
  windowRef = new BrowserWindow({
    width: 1450, height: 960, minWidth: 370, minHeight: 620, show: false,
    backgroundColor: '#F4F7F2', title: 'Xitolinos Planejamento', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  windowRef.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowRef.webContents.on('will-navigate', (event, url) => { if (!isAllowedLocalUrl(url)) event.preventDefault(); });
  await windowRef.loadURL('http://127.0.0.1:5173/');
  windowRef.show();
  windowRef.on('closed', () => { windowRef = null; });
}

app.on('second-instance', () => { if (windowRef) { if (windowRef.isMinimized()) windowRef.restore(); windowRef.focus(); } });
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => callback(isAllowedLocalUrl(details.url) ? {} : { cancel: true }));
  try { await startLocalServices(); await openWindow(); }
  catch (error) { dialog.showErrorBox('Xitolinos Planejamento', error.message); app.quit(); }
});
app.on('before-quit', () => {
  isClosing = true;
  if (localServer && localServer.exitCode === null) {
    if (process.platform === 'win32') {
      const { spawnSync } = require('node:child_process');
      spawnSync('taskkill.exe', ['/PID', String(localServer.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      if (app.isPackaged) {
        const stopArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(projectRoot, 'scripts', 'mysql.ps1'), '-Action', 'Stop', '-DataRoot', appData];
        spawn('powershell.exe', stopArgs, { stdio: 'ignore', windowsHide: true });
      }
    }
    else localServer.kill('SIGTERM');
  }
  if (logStream !== 'inherit') logStream.end();
});
app.on('window-all-closed', () => app.quit());
