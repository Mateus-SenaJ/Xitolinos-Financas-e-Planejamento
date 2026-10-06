'use strict';
module.exports = [
  'strapi::logger', 'strapi::errors', 'strapi::security',
  { name: 'strapi::cors', config: { origin: ['http://127.0.0.1:5173'], headers: ['Content-Type', 'Authorization', 'X-Sensitive-Proof'] } },
  'strapi::poweredBy', 'strapi::query',
  { name: 'strapi::body', config: { jsonLimit: '4mb', formLimit: '4mb', textLimit: '4mb', includeUnparsed: true } },
  'strapi::session', 'strapi::favicon', 'strapi::public'
];
