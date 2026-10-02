'use strict';
const { seedDemoData } = require('./seed');
const { migrateLegacyData } = require('./migrate-legacy');
module.exports = { async bootstrap({ strapi }) { await seedDemoData(strapi); const user = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { email: 'demo@xitolinos.local' } }); if (user) await migrateLegacyData(strapi, user); } };
