'use strict';

const { randomUUID } = require('node:crypto');
const { calculateLedger, currentMonth } = require('../domain/ledger');

function validationError(message) {
  return Object.assign(new Error(message), { status: 400, code: 'VALIDATION_ERROR' });
}

function text(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw validationError(`${label} é obrigatório e deve ter até ${maxLength} caracteres.`);
  }
  return value.trim();
}

function cents(value, label, allowZero = false) {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw validationError(`${label} deve ser informado em centavos inteiros e ${allowZero ? 'não pode ser negativo' : 'maior que zero'}.`);
  }
  return value;
}

function isCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

class FinanceService {
  constructor(store, clock = () => new Date()) {
    this.store = store;
    this.clock = clock;
  }

  getState(monthKey) {
    const state = this.store.loadState();
    const month = monthKey ? this.monthFromKey(monthKey) : currentMonth(this.clock);
    return { ...state, ledger: calculateLedger(state, month) };
  }

  auditEvent(entityType, entityId, action, before, after) {
    return { id: randomUUID(), entityType, entityId, action, before, after, actor: 'local-user', createdAt: this.clock().toISOString() };
  }

  getTrash() { return this.store.loadTrash(); }
  getAudit(limit = 100) { return this.store.loadAudit(limit); }

  restoreTransaction(id) {
    const restored = this.store.restoreTransaction(id, this.auditEvent('transaction', id, 'restore', null, null));
    if (!restored) throw Object.assign(new Error('Lançamento não encontrado na Lixeira.'), { status: 404, code: 'NOT_FOUND' });
    return restored;
  }

  monthFromKey(monthKey) {
    if (typeof monthKey !== 'string' || !/^\d{4}-\d{2}$/.test(monthKey)) throw validationError('Período inválido. Use YYYY-MM.');
    const [year, month] = monthKey.split('-').map(Number);
    if (month < 1 || month > 12) throw validationError('Período inválido. Use YYYY-MM.');
    const start = `${monthKey}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
    const today = this.clock();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return { key: monthKey, start, end: monthKey === todayKey.slice(0, 7) ? todayKey : monthEnd };
  }

  createTransaction(input) {
    if (!isCivilDate(input.date)) throw validationError('Data inválida. Use YYYY-MM-DD.');
    if (!['income', 'expense', 'transfer'].includes(input.type)) throw validationError('Tipo deve ser income, expense ou transfer.');
    const state = this.store.loadState();
    if (input.type === 'transfer') {
      if (!input.accountId || !input.counterpartyAccountId || input.accountId === input.counterpartyAccountId) {
        throw validationError('Selecione duas contas diferentes para a transferência.');
      }
      if (!state.accounts.some(account => account.id === input.accountId && account.status === 'active') || !state.accounts.some(account => account.id === input.counterpartyAccountId && account.status === 'active')) {
        throw validationError('Conta de origem ou destino não encontrada.');
      }
    } else if (!state.accounts.some(account => account.id === input.accountId && account.status === 'active')) {
      throw validationError('Selecione uma conta válida.');
    }
    const categoryName = input.type === 'transfer' ? 'Transferência' : input.category;
    const category = state.categories.find(item => item.name === categoryName && item.status !== 'archived');
    if (!category || (input.type !== 'transfer' && category.type !== input.type)) throw validationError('Selecione uma categoria válida para o tipo de lançamento.');
    let subcategoryId = null;
    if (input.subcategoryId) {
      const subcategory = state.categories.find(item => item.id === input.subcategoryId && item.parentId === category.id && item.status !== 'archived');
      if (!subcategory) throw validationError('A subcategoria não pertence à categoria selecionada.');
      subcategoryId = subcategory.id;
    }
    const establishment = input.establishmentId ? state.establishments.find(item => item.id === input.establishmentId && item.status !== 'archived') : null;
    if (input.establishmentId && !establishment) throw validationError('Estabelecimento não encontrado ou arquivado.');
    const transaction = {
      id: randomUUID(),
      description: text(input.description, 'Descrição', 50),
      originalDescription: input.originalDescription ? text(input.originalDescription, 'Descrição original', 120) : text(input.description, 'Descrição', 50),
      category: input.type === 'transfer' ? categoryName : text(input.category, 'Categoria', 40),
      subcategoryId,
      date: input.date,
      type: input.type,
      amountCents: cents(input.amountCents, 'Valor'),
      accountId: input.accountId,
      counterpartyAccountId: input.type === 'transfer' ? input.counterpartyAccountId : null,
      establishmentId: establishment?.id || null
    };
    state.transactions.push(transaction);
    this.store.saveState(state, this.auditEvent('transaction', transaction.id, 'create', null, transaction));
    return transaction;
  }

  createAccount(input) {
    const account = {
      id: randomUUID(), name: text(input.name, 'Nome da conta', 50),
      institution: input.institution ? text(input.institution, 'Instituição', 50) : '',
      type: ['checking', 'digital', 'cash', 'savings', 'investment', 'reserve', 'other'].includes(input.type) ? input.type : 'checking',
      openingBalanceCents: cents(input.openingBalanceCents ?? 0, 'Saldo inicial', true),
      isLiquid: input.isLiquid !== false, priority: Number.isSafeInteger(input.priority) && input.priority > 0 ? input.priority : 1,
      status: 'active', notes: input.notes ? text(input.notes, 'Observação', 240) : ''
    };
    const state = this.store.loadState();
    state.accounts.push(account);
    this.store.saveState(state, this.auditEvent('account', account.id, 'create', null, account));
    return account;
  }

  updateAccount(id, input) {
    const state = this.store.loadState();
    const account = state.accounts.find(item => item.id === id);
    if (!account) throw Object.assign(new Error('Conta não encontrada.'), { status: 404, code: 'NOT_FOUND' });
    const before = { ...account };
    if (input.name !== undefined) account.name = text(input.name, 'Nome da conta', 50);
    if (input.institution !== undefined) account.institution = input.institution ? text(input.institution, 'Instituição', 50) : '';
    if (input.type !== undefined) {
      if (!['checking', 'digital', 'cash', 'savings', 'investment', 'reserve', 'other'].includes(input.type)) throw validationError('Tipo de conta inválido.');
      account.type = input.type;
    }
    if (input.openingBalanceCents !== undefined) account.openingBalanceCents = cents(input.openingBalanceCents, 'Saldo inicial', true);
    if (input.isLiquid !== undefined) account.isLiquid = Boolean(input.isLiquid);
    if (input.priority !== undefined) account.priority = cents(input.priority, 'Prioridade');
    if (input.notes !== undefined) account.notes = input.notes ? text(input.notes, 'Observação', 240) : '';
    if (input.status !== undefined) {
      if (!['active', 'archived'].includes(input.status)) throw validationError('Status de conta inválido.');
      account.status = input.status;
    }
    this.store.saveState(state, this.auditEvent('account', id, 'update', before, account));
    return account;
  }

  createCategory(input) {
    const category = {
      id: randomUUID(), name: text(input.name, 'Nome da categoria', 40),
      type: ['income', 'expense'].includes(input.type) ? input.type : null,
      parentId: input.parentId || null,
      icon: input.icon ? text(input.icon, 'Ícone', 12) : '',
      status: 'active'
    };
    if (!category.type) throw validationError('Tipo da categoria deve ser income ou expense.');
    const state = this.store.loadState();
    if (category.parentId) {
      const parent = state.categories.find(item => item.id === category.parentId && item.status !== 'archived');
      if (!parent || parent.type !== category.type) throw validationError('A categoria superior não existe ou tem outro tipo.');
    }
    if (state.categories.some(item => item.name.toLocaleLowerCase('pt-BR') === category.name.toLocaleLowerCase('pt-BR'))) {
      throw validationError('Já existe uma categoria com esse nome.');
    }
    state.categories.push(category);
    this.store.saveState(state, this.auditEvent('category', category.id, 'create', null, category));
    return category;
  }

  archiveCategory(id) {
    const state = this.store.loadState();
    const category = state.categories.find(item => item.id === id);
    if (!category) throw Object.assign(new Error('Categoria não encontrada.'), { status: 404, code: 'NOT_FOUND' });
    const before = { ...category };
    const children = state.categories.filter(item => item.parentId === id && item.status !== 'archived');
    if (children.length) throw validationError('Arquive primeiro as subcategorias desta categoria.');
    category.status = 'archived';
    this.store.saveState(state, this.auditEvent('category', id, 'archive', before, category));
    return category;
  }

  updateCategoryStatus(id, status) {
    if (!['active', 'archived'].includes(status)) throw validationError('Status de categoria inválido.');
    const state = this.store.loadState();
    const category = state.categories.find(item => item.id === id);
    if (!category) throw Object.assign(new Error('Categoria não encontrada.'), { status: 404, code: 'NOT_FOUND' });
    const before = { ...category };
    if (status === 'active' && category.parentId) {
      const parent = state.categories.find(item => item.id === category.parentId && item.status !== 'archived');
      if (!parent) throw validationError('Reative a categoria superior antes desta subcategoria.');
    }
    if (status === 'archived' && state.categories.some(item => item.parentId === id && item.status !== 'archived')) {
      throw validationError('Arquive primeiro as subcategorias desta categoria.');
    }
    category.status = status;
    this.store.saveState(state, this.auditEvent('category', id, status === 'archived' ? 'archive' : 'restore', before, category));
    return category;
  }

  createEstablishment(input) {
    const name = text(input.name, 'Nome do estabelecimento', 80);
    const state = this.store.loadState();
    if (state.establishments.some(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw validationError('Este estabelecimento já existe.');
    const establishment = {
      id: randomUUID(), name,
      defaultCategory: input.defaultCategory || null,
      tags: Array.isArray(input.tags) ? input.tags.map(tag => text(tag, 'Tag', 24)).slice(0, 12) : [],
      aliases: [], status: 'active'
    };
    if (establishment.defaultCategory && !state.categories.some(category => category.name === establishment.defaultCategory && category.status !== 'archived')) throw validationError('A categoria padrão não existe ou está arquivada.');
    const knownAliases = new Set(state.establishments.flatMap(item => [item.name, ...item.aliases]).map(value => this.normalizeMerchant(value)));
    if (knownAliases.has(this.normalizeMerchant(establishment.name))) throw validationError('O nome do estabelecimento já está em uso por outro nome ou alias.');
    const localAliases = new Set([this.normalizeMerchant(establishment.name)]);
    for (const alias of Array.isArray(input.aliases) ? input.aliases.map(value => text(value, 'Alias', 80)) : []) {
      const normalized = this.normalizeMerchant(alias);
      if (localAliases.has(normalized)) continue;
      if (knownAliases.has(normalized)) throw validationError(`O nome ou alias "${alias}" já está em uso.`);
      localAliases.add(normalized);
      knownAliases.add(normalized);
      establishment.aliases.push(alias);
    }
    state.establishments.push(establishment);
    this.store.saveState(state, this.auditEvent('establishment', establishment.id, 'create', null, establishment));
    return establishment;
  }

  updateEstablishment(id, input) {
    const state = this.store.loadState();
    const establishment = state.establishments.find(item => item.id === id);
    if (!establishment) throw Object.assign(new Error('Estabelecimento não encontrado.'), { status: 404, code: 'NOT_FOUND' });
    const before = structuredClone(establishment);
    if (input.name !== undefined) establishment.name = text(input.name, 'Nome do estabelecimento', 80);
    const otherNames = new Set(state.establishments.filter(item => item.id !== id).flatMap(item => [item.name, ...item.aliases]).map(value => this.normalizeMerchant(value)));
    if (otherNames.has(this.normalizeMerchant(establishment.name))) throw validationError('O nome já está em uso por outro estabelecimento ou alias.');
    if (input.defaultCategory !== undefined) {
      establishment.defaultCategory = input.defaultCategory || null;
      if (establishment.defaultCategory && !state.categories.some(category => category.name === establishment.defaultCategory && category.status !== 'archived')) throw validationError('A categoria padrão não existe ou está arquivada.');
    }
    if (input.tags !== undefined) {
      if (!Array.isArray(input.tags)) throw validationError('Tags devem ser uma lista.');
      establishment.tags = [...new Set(input.tags.map(tag => text(tag, 'Tag', 24)))].slice(0, 12);
    }
    if (input.aliases !== undefined) {
      if (!Array.isArray(input.aliases)) throw validationError('Aliases devem ser uma lista.');
      const aliases = [...new Set(input.aliases.map(alias => text(alias, 'Alias', 80)))];
      const otherAliases = new Set(state.establishments.filter(item => item.id !== id).flatMap(item => [item.name, ...item.aliases]).map(value => this.normalizeMerchant(value)));
      const ownNames = new Set([this.normalizeMerchant(establishment.name)]);
      establishment.aliases = [];
      for (const alias of aliases) {
        const normalized = this.normalizeMerchant(alias);
        if (ownNames.has(normalized)) continue;
        if (otherAliases.has(normalized)) throw validationError(`O nome ou alias "${alias}" já está em uso.`);
        ownNames.add(normalized);
        establishment.aliases.push(alias);
      }
    }
    if (input.status !== undefined) {
      if (!['active', 'archived'].includes(input.status)) throw validationError('Status de estabelecimento inválido.');
      establishment.status = input.status;
    }
    this.store.saveState(state, this.auditEvent('establishment', id, 'update', before, establishment));
    return establishment;
  }

  normalizeMerchant(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
  }

  deleteTransaction(id) {
    const deleted = this.store.softDeleteTransaction(id, this.auditEvent('transaction', id, 'soft_delete', null, null));
    if (!deleted) throw Object.assign(new Error('Lançamento não encontrado.'), { status: 404, code: 'NOT_FOUND' });
    return deleted;
  }

  createGoal(input) {
    const goal = {
      id: randomUUID(), name: text(input.name, 'Nome da meta', 45),
      targetCents: cents(input.targetCents, 'Valor desejado'),
      savedCents: cents(input.savedCents ?? 0, 'Valor guardado', true), symbol: '◎'
    };
    const state = this.store.loadState();
    state.goals.push(goal);
    this.store.saveState(state, this.auditEvent('goal', goal.id, 'create', null, goal));
    return goal;
  }

  updateGoal(id, input) {
    const state = this.store.loadState();
    const goal = state.goals.find(item => item.id === id);
    if (!goal) throw Object.assign(new Error('Meta não encontrada.'), { status: 404, code: 'NOT_FOUND' });
    const before = { ...goal };
    if (input.name !== undefined) goal.name = text(input.name, 'Nome da meta', 45);
    if (input.targetCents !== undefined) goal.targetCents = cents(input.targetCents, 'Valor desejado');
    if (input.savedCents !== undefined) goal.savedCents = cents(input.savedCents, 'Valor guardado', true);
    this.store.saveState(state, this.auditEvent('goal', id, 'update', before, goal));
    return goal;
  }

  deleteGoal(id) {
    const state = this.store.loadState();
    const index = state.goals.findIndex(item => item.id === id);
    if (index < 0) throw Object.assign(new Error('Meta não encontrada.'), { status: 404, code: 'NOT_FOUND' });
    const [deleted] = state.goals.splice(index, 1);
    this.store.saveState(state, this.auditEvent('goal', id, 'delete', deleted, null));
    return deleted;
  }

  updateBudget(category, input) {
    const state = this.store.loadState();
    const budget = state.budgets.find(item => item.category === category);
    if (!budget) throw Object.assign(new Error('Orçamento não encontrado.'), { status: 404, code: 'NOT_FOUND' });
    const before = { ...budget };
    budget.limitCents = cents(input.limitCents, 'Limite do orçamento', true);
    this.store.saveState(state, this.auditEvent('budget', category, 'update', before, budget));
    return budget;
  }
}

module.exports = { FinanceService, isCivilDate };