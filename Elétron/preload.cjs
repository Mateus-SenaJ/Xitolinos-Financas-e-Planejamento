'use strict';

const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('xitolinosDesktop', Object.freeze({ mode: 'local', version: '1.0.0' }));
