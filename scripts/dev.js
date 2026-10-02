'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packaged = process.env.XITOLINOS_PACKAGED === '1';
const dataRoot = process.env.XITOLINOS_DATA_DIR || '';
if (packaged) require('dotenv').config({ path: path.join(dataRoot, 'backend', '.env') });
const swcCache = process.env.SWC_NATIVE_BINDING_CACHE || path.join(os.homedir(), '.cache', 'xitolinos-swc');
fs.mkdirSync(swcCache, { recursive: true });
const runtimeEnv = { ...process.env, SWC_NATIVE_BINDING_CACHE: swcCache, ...(packaged ? { NODE_ENV: 'production' } : {}) };

if (process.platform === 'win32') {
  const setupArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'mysql.ps1'), '-Action', 'Start'];
  if (dataRoot) setupArgs.push('-DataRoot', dataRoot);
  const setup = spawnSync('powershell.exe', setupArgs, { cwd: root, stdio: 'inherit', windowsHide: packaged });
  if (setup.status !== 0) process.exit(setup.status || 1);
}

const children = packaged
  ? [
      spawn(process.execPath, [path.join(root, 'node_modules', '@strapi', 'strapi', 'bin', 'strapi.js'), 'start'], { cwd: path.join(root, 'backend'), env: runtimeEnv, stdio: 'inherit', windowsHide: true }),
      spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', '5173'], { cwd: path.join(root, 'frontend'), env: runtimeEnv, stdio: 'inherit', windowsHide: true })
    ]
  : [
      spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--workspace', 'backend', 'run', 'develop'], { cwd: root, env: runtimeEnv, stdio: 'inherit', shell: process.platform === 'win32' }),
      spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--workspace', 'frontend', 'run', 'dev', '--', '--host', '127.0.0.1'], { cwd: root, env: runtimeEnv, stdio: 'inherit', shell: process.platform === 'win32' })
    ];

let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) {
    if (process.platform === 'win32' && child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill(signal);
  }
  if (packaged && process.platform === 'win32') {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'mysql.ps1'), '-Action', 'Stop'];
    if (dataRoot) args.push('-DataRoot', dataRoot);
    spawn('powershell.exe', args, { cwd: root, stdio: 'ignore', windowsHide: true });
  }
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
for (const child of children) child.on('exit', code => { if (!stopping && code !== 0) { stop(); process.exitCode = code || 1; } });
