'use strict';

const { errors } = require('@strapi/utils');
const crypto = require('node:crypto');
const StripeClient = require('stripe');

const subscriptionUid = 'api::billing-subscription.billing-subscription';
const subscriptionStatuses = new Set([
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
]);

function stripeClient() {
  return new StripeClient(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
}

function stripeBaseUrl() {
  let url;
  try { url = new URL(String(process.env.STRIPE_WEB_BASE_URL || '')); }
  catch { throw new errors.ValidationError('Configure STRIPE_WEB_BASE_URL com a origem do aplicativo.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new errors.ValidationError('STRIPE_WEB_BASE_URL precisa ser uma origem HTTP(S) sem credenciais, consulta ou fragmento.');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new errors.ValidationError('STRIPE_WEB_BASE_URL precisa usar HTTPS em produção.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function isConfigured({ requirePrice = true } = {}) {
  if (process.env.BILLING_ENABLED !== 'true' || !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return false;
  if (requirePrice && !process.env.STRIPE_PRICE_ID) return false;
  try { stripeBaseUrl(); return true; } catch { return false; }
}

function requireConfigured(options) {
  if (!isConfigured(options)) {
    throw new errors.ValidationError('A assinatura Stripe não está habilitada ou ainda não foi configurada para esta versão online.');
  }
}

async function ownedSubscription(strapi, userId) {
  return (await strapi.entityService.findMany(subscriptionUid, {
    filters: { owner: { id: { $eq: userId } } }, limit: 1
  }))[0] || null;
}

async function createCheckout(strapi, user) {
  requireConfigured();
  const client = stripeClient();
  let record = await ownedSubscription(strapi, user.id);
  if (!record) {
    record = await strapi.entityService.create(subscriptionUid, { data: {
      provider: 'stripe', plan: 'xitolinos', status: 'incomplete', owner: user.id
    } });
  }
  if (record.subscriptionId && !['canceled', 'incomplete_expired'].includes(record.status)) {
    throw new errors.ValidationError('Já existe uma assinatura em andamento. Use o portal para gerenciá-la.');
  }

  let customerId = record.customerId || null;
  if (customerId) {
    try {
      const customer = await client.customers.retrieve(customerId);
      if (customer.deleted) customerId = null;
    } catch (error) {
      if (error.code === 'resource_missing' || error.statusCode === 404) customerId = null;
      else throw error;
    }
  }
  if (!customerId) {
    const customer = await client.customers.create({
      email: user.email,
      metadata: { product: 'xitolinos-planejamento' }
    });
    customerId = customer.id;
  }

  await strapi.entityService.update(subscriptionUid, record.id, { data: { provider: 'stripe', customerId } });

  const subscriptions = await client.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  const currentSubscription = subscriptions.data.find(item => !['canceled', 'incomplete_expired'].includes(item.status));
  if (currentSubscription) {
    await syncSubscription(strapi, currentSubscription, true);
    throw new errors.ValidationError('Já existe uma assinatura em andamento. Use o portal para gerenciá-la.');
  }

  const openSessions = await client.checkout.sessions.list({ customer: customerId, status: 'open', limit: 1 });
  if (openSessions.data[0]?.url) return { url: openSessions.data[0].url };

  const checkoutAttemptId = crypto.randomUUID();
  await strapi.entityService.update(subscriptionUid, record.id, { data: {
    provider: 'stripe', plan: 'xitolinos', status: 'incomplete', customerId,
    subscriptionId: null, checkoutAttemptId, periodEnd: null
  } });

  const baseUrl = stripeBaseUrl();
  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${baseUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?billing=cancelled`,
    subscription_data: { metadata: { product: 'xitolinos-planejamento', xitolinosCheckoutAttempt: checkoutAttemptId } }
  });
  if (!session.url) throw new errors.ApplicationError('O Stripe não retornou um endereço para concluir a assinatura.');
  return { url: session.url };
}

async function createPortalSession(strapi, user) {
  requireConfigured({ requirePrice: false });
  const record = await ownedSubscription(strapi, user.id);
  if (!record?.customerId) throw new errors.ValidationError('Ainda não há uma assinatura Stripe para gerenciar.');
  const session = await stripeClient().billingPortal.sessions.create({
    customer: record.customerId,
    return_url: `${stripeBaseUrl()}/?billing=return`
  });
  return { url: session.url };
}

async function syncSubscription(strapi, subscription, allowReplacement = false) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  if (!customerId || !subscription.id) return;
  const record = (await strapi.entityService.findMany(subscriptionUid, {
    filters: { customerId: { $eq: customerId } }, limit: 1
  }))[0];
  if (!record) return;
  if (!allowReplacement && record.checkoutAttemptId && subscription.metadata?.xitolinosCheckoutAttempt !== record.checkoutAttemptId) return;
  if (!allowReplacement && !record.checkoutAttemptId && record.subscriptionId && record.subscriptionId !== subscription.id) return;

  const price = subscription.items?.data?.[0]?.price;
  const periodEnd = Number(subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end || 0);
  const status = subscriptionStatuses.has(subscription.status) ? subscription.status : 'incomplete';
  await strapi.entityService.update(subscriptionUid, record.id, { data: {
    provider: 'stripe',
    plan: String(price?.lookup_key || price?.id || record.plan || 'xitolinos').slice(0, 40),
    status,
    subscriptionId: subscription.id,
    checkoutAttemptId: null,
    periodEnd: periodEnd > 0 ? new Date(periodEnd * 1000).toISOString().slice(0, 10) : null
  } });
}

function invoiceSubscriptionId(invoice) {
  const subscription = invoice.subscription || invoice.parent?.subscription_details?.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id;
}

async function syncRelatedSubscription(client, strapi, object) {
  let subscriptionId = null;
  if (object.object === 'subscription') subscriptionId = object.id;
  else if (object.object === 'checkout.session') {
    subscriptionId = typeof object.subscription === 'string' ? object.subscription : object.subscription?.id;
  } else if (object.object === 'invoice') subscriptionId = invoiceSubscriptionId(object);
  if (!subscriptionId) return;
  await syncSubscription(strapi, await client.subscriptions.retrieve(subscriptionId));
}

async function handleWebhook(strapi, ctx) {
  requireConfigured({ requirePrice: false });
  const rawBody = ctx.request.body?.[Symbol.for('unparsedBody')];
  const signature = ctx.get('stripe-signature');
  if ((!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') || !signature) {
    throw new errors.UnauthorizedError('O webhook Stripe não contém uma assinatura válida.');
  }

  const client = stripeClient();
  let event;
  try { event = client.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { throw new errors.UnauthorizedError('A assinatura do webhook Stripe é inválida.'); }

  if (event.type.startsWith('customer.subscription.')) {
    await syncRelatedSubscription(client, strapi, event.data.object);
  } else if (
    event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'invoice.paid' || event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_action_required'
  ) {
    await syncRelatedSubscription(client, strapi, event.data.object);
  }
  ctx.status = 200;
  ctx.body = { received: true };
}

module.exports = { isConfigured, createCheckout, createPortalSession, handleWebhook };
