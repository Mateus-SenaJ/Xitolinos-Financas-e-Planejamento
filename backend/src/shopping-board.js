'use strict';

const defaultCatalog = require('../../frontend/src/shopping-catalog.json');

const LIST_KINDS = new Set(['market', 'pharmacy', 'other']);
const ITEM_STATES = new Set(['planned', 'purchased', 'not-found', 'buy-elsewhere', 'postponed']);
const UNITS = new Set(['un', 'kg', 'g', 'l', 'ml', 'pack']);
const MAX_LISTS = 120;
const MAX_ITEMS = 4000;

function text(value, label, maxLength) {
  const result = String(value || '').trim();
  if (!result || result.length > maxLength) throw new Error(`${label} inválido.`);
  return result;
}

function nonNegativeCents(value, label) {
  const cents = Number(value ?? 0);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`${label} precisa ser um inteiro em centavos igual ou maior que zero.`);
  return cents;
}

function quantity(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 1_000_000) throw new Error('Quantidade inválida.');
  return result;
}

function validId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error('Identificador de compra inválido.');
  return id;
}

function normalizeShoppingBoard(input = {}, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Lista de compras inválida.');
  if (!Array.isArray(input.lists) || input.lists.length > MAX_LISTS) throw new Error('Quantidade de listas inválida.');
  if (!Array.isArray(input.stock) || input.stock.length > MAX_ITEMS) throw new Error('Estoque inválido.');

  const priorLists = new Map((Array.isArray(previous.lists) ? previous.lists : []).map(item => [item.id, item]));
  const ids = new Set();
  let itemCount = 0;
  const lists = input.lists.map(list => {
    if (!list || !LIST_KINDS.has(list.kind)) throw new Error('Tipo de lista inválido.');
    const id = validId(list.id);
    if (ids.has(id)) throw new Error('A lista contém identificadores repetidos.');
    ids.add(id);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(list.month || ''))) throw new Error('Mês da lista inválido.');
    if (!Array.isArray(list.items)) throw new Error('Itens da lista inválidos.');
    itemCount += list.items.length;
    if (itemCount > MAX_ITEMS) throw new Error('A lista ultrapassa o limite local de itens.');
    const previousList = priorLists.get(id);
    const completedCents = shoppingListTotalCents({ items: list.items });
    if (list.status === 'completed' && previousList?.status !== 'completed' && (!Number.isSafeInteger(completedCents) || completedCents <= 0)) throw new Error('A lista precisa ter ao menos um item comprado com valor pago para ser finalizada.');
    const fingerprint = value => JSON.stringify({
      id: value.id, month: value.month, kind: value.kind, name: value.name, status: value.status,
      items: (value.items || []).map(item => ({ id: item.id, catalogId: item.catalogId || '', name: item.name, category: item.category || 'Outros', section: item.section, quantityMilli: item.quantityMilli, unit: item.unit, estimatedCents: item.estimatedCents, paidCents: item.paidCents, status: item.status, addedToStock: item.addedToStock === true }))
    });
    if (previousList?.financialTransactionId) {
      if (fingerprint(list) !== fingerprint(previousList)) throw new Error('Esta lista já foi contabilizada e não pode ser alterada.');
    }
    if (previousList?.status === 'completed' && (list.status !== 'completed' || fingerprint(list) !== fingerprint(previousList))) throw new Error('Esta lista foi finalizada e não pode ser alterada.');
    const itemIds = new Set();
    return {
      id,
      month: list.month,
      kind: list.kind,
      name: text(list.name, 'Nome da lista', 100),
      status: list.status === 'completed' ? 'completed' : 'open',
      financialTransactionId: previousList?.financialTransactionId || null,
      items: list.items.map(item => {
        const itemId = validId(item.id);
        if (itemIds.has(itemId)) throw new Error('A lista contém itens com identificadores repetidos.');
        itemIds.add(itemId);
        if (!ITEM_STATES.has(item.status || 'planned')) throw new Error('Estado de item inválido.');
        if (!UNITS.has(item.unit || 'un')) throw new Error('Unidade do item inválida.');
        return {
          id: itemId,
          catalogId: item.catalogId ? text(item.catalogId, 'Identificador do produto', 80) : '',
          name: text(item.name, 'Nome do item', 100),
          category: text(item.category || 'Outros', 'Categoria do item', 60),
          section: text(item.section || 'Outros', 'Seção', 60),
          quantityMilli: quantity(item.quantityMilli ?? 1000),
          unit: item.unit || 'un',
          estimatedCents: nonNegativeCents(item.estimatedCents, 'Preço estimado'),
          paidCents: nonNegativeCents(item.paidCents, 'Preço pago'),
          status: item.status || 'planned',
          addedToStock: item.addedToStock === true
        };
      })
    };
  });

  for (const list of priorLists.values()) {
    if ((list.financialTransactionId || list.status === 'completed') && !ids.has(list.id)) throw new Error('Uma lista finalizada n\u00E3o pode ser removida do hist\u00F3rico.');
  }

  const stockIds = new Set();
  const stock = input.stock.map(item => {
    const id = validId(item.id);
    if (stockIds.has(id)) throw new Error('O estoque contém identificadores repetidos.');
    stockIds.add(id);
    if (!UNITS.has(item.unit || 'un')) throw new Error('Unidade de estoque inválida.');
    return {
      id,
      name: text(item.name, 'Nome do item em casa', 100),
      section: text(item.section || 'Outros', 'Seção', 60),
      quantityMilli: quantity(item.quantityMilli ?? 1000),
      unit: item.unit || 'un'
    };
  });
  return { lists, stock, catalog: Array.isArray(previous.catalog) && previous.catalog.length ? previous.catalog : Array.isArray(input.catalog) && input.catalog.length ? input.catalog : defaultCatalog };
}

function shoppingListTotalCents(list) {
  return (list?.items || []).filter(item => item.status === 'purchased' && item.paidCents > 0)
    .reduce((total, item) => {
      const lineTotal = Math.round(Number(item.paidCents) * Number(item.quantityMilli ?? 1000) / 1000);
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) throw new Error('O total da compra ultrapassa o limite permitido.');
      return total + lineTotal;
    }, 0);
}

module.exports = { normalizeShoppingBoard, shoppingListTotalCents };
