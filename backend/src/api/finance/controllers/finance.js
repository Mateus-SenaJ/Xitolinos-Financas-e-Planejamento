'use strict';
const { factories } = require('@strapi/strapi');
const { makeActions } = require('../../../finance-api');
module.exports = factories.createCoreController('api::finance.finance', ({ strapi }) => makeActions(strapi));
