'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cache = process.env.SWC_NATIVE_BINDING_CACHE || path.join(os.homedir(), '.cache', 'xitolinos-swc');
fs.mkdirSync(cache, { recursive: true });
const command = process.argv[2];
if (!['develop', 'start', 'build'].includes(command)) throw new Error('Informe develop, start ou build.');

const strapi = path.join(root, 'node_modules', '@strapi', 'strapi', 'bin', 'strapi.js');
const child = spawn(process.execPath, [strapi, command, ...process.argv.slice(3)], {
  cwd: path.join(root, 'backend'),
  env: { ...process.env, SWC_NATIVE_BINDING_CACHE: cache },
  stdio: 'inherit',
  windowsHide: true
});

child.on('error', error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
