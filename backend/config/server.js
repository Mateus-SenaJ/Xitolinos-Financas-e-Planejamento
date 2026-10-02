'use strict';
module.exports = ({ env }) => ({
  host: env('HOST', '127.0.0.1'),
  port: env.int('PORT', 1337),
  app: { keys: env.array('APP_KEYS') },
  url: env('SERVER_URL', 'http://127.0.0.1:1337')
});
