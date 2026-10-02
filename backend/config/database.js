'use strict';
module.exports = ({ env }) => ({
  connection: {
    client: env('DATABASE_CLIENT', 'mysql'),
    connection: {
      host: env('DATABASE_HOST', '127.0.0.1'),
      port: env.int('DATABASE_PORT', 3307),
      database: env('DATABASE_NAME', 'xitolinos_financas'),
      user: env('DATABASE_USERNAME', 'xitolinos'),
      password: env('DATABASE_PASSWORD'),
      ssl: env.bool('DATABASE_SSL', false) ? { rejectUnauthorized: true } : false
    },
    pool: { min: 0, max: env.int('DATABASE_POOL_MAX', 10) },
    acquireConnectionTimeout: 60000
  }
});
