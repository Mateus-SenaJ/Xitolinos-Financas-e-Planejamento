import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

const mockStore = vi.hoisted(() => ({ state: null }));

vi.mock('./sqlite-store.js', () => ({
  readMobileState: async () => mockStore.state ? structuredClone(mockStore.state) : null,
  writeMobileState: async state => { mockStore.state = structuredClone(state); },
  updateMobileState: async update => {
    const next = await update(mockStore.state ? structuredClone(mockStore.state) : null);
    mockStore.state = structuredClone(next);
    return next;
  }
}));

import { api, login } from './api.js';
import { DEMO_CREDENTIALS } from './seed-state.js';
import shoppingCatalog from '../shopping-catalog.json';

const owner = DEMO_CREDENTIALS.owner;
const shopping = DEMO_CREDENTIALS.shopping;

async function signIn(credentials = owner) {
  return login(credentials.email, credentials.password);
}

describe('API local do aplicativo Android', () => {
  beforeEach(() => {
    mockStore.state = null;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  });

  it('cria sessão local e monta o dashboard com valores em centavos', async () => {
    const session = await signIn();
    const dashboard = await api('/finance/dashboard?month=2026-10', { token: session.token });

    expect(session.user.profile).toBe('owner');
    expect(dashboard.profile.email).toBe(owner.email);
    expect(dashboard.month).toBe('2026-10');
    expect(Number.isSafeInteger(dashboard.totals.expenseCents)).toBe(true);
    expect(dashboard.totals).not.toHaveProperty('expenses');
    expect(mockStore.state.sessions[0].token).toBe(session.token);
  });

  it('restringe o perfil secundário à lista compartilhada de compras', async () => {
    const session = await signIn(shopping);
    const board = await api('/finance/shopping', { token: session.token });

    expect(session.user.profile).toBe('shopping_viewer');
    expect(board).toEqual({ lists: [], stock: [], catalog: shoppingCatalog });
    await expect(api('/finance/dashboard?month=2026-10', { token: session.token }))
      .rejects.toThrow('só pode consultar a lista de compras');
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: '{}' }))
      .rejects.toThrow('só pode consultar a lista de compras');
  });

  it('salva uma lista, registra a compra uma vez como despesa e trava a lista contabilizada', async () => {
    const session = await signIn();
    const board = {
      lists: [{
        id: 'list_202610', month: '2026-10', kind: 'market', name: 'Mercado', status: 'open',
        items: [{ id: 'item_0001', name: 'Leite', section: 'Laticínios e ovos', quantityMilli: 2000, unit: 'l', estimatedCents: 500, paidCents: 650, status: 'purchased' }]
      }],
      stock: []
    };
    await api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify(board) });

    const first = await api('/finance/shopping/commit', { token: session.token, method: 'POST', body: JSON.stringify({ listId: 'list_202610', month: '2026-10', date: '2026-10-06' }) });
    const retry = await api('/finance/shopping/commit', { token: session.token, method: 'POST', body: JSON.stringify({ listId: 'list_202610', month: '2026-10', date: '2026-10-06' }) });

    expect(first).toMatchObject({ alreadyRecorded: false, amountCents: 1300 });
    expect(retry).toMatchObject({ alreadyRecorded: true, amountCents: 1300 });
    expect(mockStore.state.transactions.filter(item => item.shoppingImportId === 'list_202610')).toHaveLength(1);
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify({ ...board, lists: [{ ...board.lists[0], name: 'Mercado alterado' }] }) }))
      .rejects.toThrow('já foi contabilizada');
  });

  it('não permite editar ou reabrir uma lista finalizada no armazenamento local', async () => {
    const session = await signIn();
    const emptyCompletion = { lists: [{ id: 'list_empty1', month: '2026-11', kind: 'market', name: 'Compra sem pagamento', status: 'completed', items: [{ id: 'item_empty1', name: 'Arroz', section: 'Mercearia', quantityMilli: 1000, unit: 'kg', estimatedCents: 800, paidCents: 0, status: 'planned' }] }], stock: [] };
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify(emptyCompletion) }))
      .rejects.toThrow('valor pago para ser finalizada');
    const unpurchasedCompletion = {
      lists: [{ ...emptyCompletion.lists[0], id: 'list_unbought', name: 'Item ainda não comprado', items: [{ ...emptyCompletion.lists[0].items[0], id: 'item_unbought', paidCents: 900 }] }],
      stock: []
    };
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify(unpurchasedCompletion) }))
      .rejects.toThrow('valor pago para ser finalizada');
    const board = {
      lists: [{ id: 'list_202611', month: '2026-11', kind: 'market', name: 'Mercado finalizado', status: 'completed', items: [{ id: 'item_0002', name: 'Arroz', section: 'Mercearia', quantityMilli: 1000, unit: 'kg', estimatedCents: 800, paidCents: 900, status: 'purchased' }] }],
      stock: []
    };
    await api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify(board) });
    const saved = await api('/finance/shopping', { token: session.token });
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify({ ...saved, lists: [{ ...saved.lists[0], status: 'open' }] }) }))
      .rejects.toThrow('foi finalizada');
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify({ ...saved, lists: [{ ...saved.lists[0], name: 'Lista alterada' }] }) }))
      .rejects.toThrow('foi finalizada');
    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify({ ...saved, lists: [] }) }))
      .rejects.toThrow('não pode ser removida do histórico');
  });

  it('rejeita finalizar uma lista cujo total ultrapassa inteiros seguros', async () => {
    const session = await signIn();
    const board = {
      lists: [{
        id: 'list_overflow', month: '2026-11', kind: 'market', name: 'Compra acima do limite', status: 'completed',
        items: [{ id: 'item_overflow', name: 'Arroz', section: 'Mercearia', quantityMilli: 1000000, unit: 'kg', estimatedCents: 0, paidCents: Number.MAX_SAFE_INTEGER, status: 'purchased' }]
      }],
      stock: []
    };

    await expect(api('/finance/shopping', { token: session.token, method: 'PUT', body: JSON.stringify(board) }))
      .rejects.toThrow('total da compra ultrapassa o limite permitido');
  });

  it('grava, classifica, edita e restaura uma movimentação sem arredondar centavos', async () => {
    const session = await signIn();
    const created = await api('/finance/transactions', {
      token: session.token,
      method: 'POST',
      body: JSON.stringify({ description: 'Compra de teste', amountCents: 12345, type: 'expense', date: '2026-10-07', categoryId: 2, spendingContext: 'extra' })
    });
    const row = created.items[0];

    expect(row.amountCents).toBe(12345);
    expect(row.status).toBe('planned');
    expect(row.spendingContext).toBe('extra');

    await api(`/finance/transactions/${row.id}`, { token: session.token, method: 'PUT', body: JSON.stringify({ description: 'Compra revisada', spendingContext: 'routine', status: 'pending', receiptData: { fileName: 'recibo.jpg', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,dGVzdA==' } }) });
    expect(mockStore.state.transactions.find(item => item.id === row.id)).toMatchObject({ description: 'Compra revisada', amountCents: 12345, spendingContext: 'routine' });

    await api(`/finance/transactions/${row.id}/delete`, { token: session.token, method: 'POST', body: '{}' });
    expect(mockStore.state.transactions.find(item => item.id === row.id).status).toBe('voided');
    const deleteAudit = mockStore.state.auditEvents.find(event => event.action === 'delete' && event.entityId === String(row.id));
    expect(deleteAudit.beforeJson.receiptData.dataUrl).toBe('[comprovante armazenado localmente]');
    expect(deleteAudit.afterJson.receiptData.dataUrl).toBe('[comprovante armazenado localmente]');
    await api(`/finance/transactions/${row.id}/restore`, { token: session.token, method: 'POST', body: '{}' });
    expect(mockStore.state.transactions.find(item => item.id === row.id).status).toBe('pending');
    const restoreAudit = mockStore.state.auditEvents.find(event => event.action === 'restore' && event.entityId === String(row.id));
    expect(restoreAudit.beforeJson.receiptData.dataUrl).toBe('[comprovante armazenado localmente]');
    expect(restoreAudit.afterJson.receiptData.dataUrl).toBe('[comprovante armazenado localmente]');
    await api('/finance/transactions/reset', { token: session.token, method: 'POST', body: '{}' });
    expect(mockStore.state.transactions.find(item => item.id === row.id).statusBeforeDelete).toBe('pending');
    await api(`/finance/transactions/${row.id}/restore`, { token: session.token, method: 'POST', body: '{}' });
    expect(mockStore.state.transactions.find(item => item.id === row.id)).toMatchObject({ status: 'pending', statusBeforeDelete: null });
  });

  it('rejeita valores fora de centavos inteiros e datas impossíveis', async () => {
    const session = await signIn();
    const originalCount = mockStore.state.transactions.length;

    await expect(api('/finance/transactions', {
      token: session.token,
      method: 'POST',
      body: JSON.stringify({ description: 'Inválido', amountCents: 12.5, date: '2026-10-07' })
    })).rejects.toThrow('valor positivo em centavos');
    await expect(api('/finance/transactions', {
      token: session.token,
      method: 'POST',
      body: JSON.stringify({ description: 'Inválido', amountCents: 1200, date: '2026-02-30' })
    })).rejects.toThrow('Data inválida');

    expect(mockStore.state.transactions).toHaveLength(originalCount);
  });

  it('expõe a biometria nativa como preferência local e valida a senha para remover', async () => {
    const session = await signIn();
    await api('/finance/security/registration/verify', { token: session.token, method: 'POST', body: JSON.stringify({ native: true }) });

    expect((await api('/finance/security/status', { token: session.token })).enabled).toBe(true);
    await expect(api('/finance/security/credential/remove', { token: session.token, method: 'POST', body: JSON.stringify({ password: 'senha errada' }) }))
      .rejects.toThrow('senha da conta está incorreta');
    await api('/finance/security/credential/remove', { token: session.token, method: 'POST', body: JSON.stringify({ password: owner.password }) });
    expect((await api('/finance/security/status', { token: session.token })).enabled).toBe(false);
  });

  it('exporta backup sem sessão, senha ou preferência biométrica', async () => {
    const session = await signIn();
    mockStore.state.preferences.androidBiometricEnabled = true;
    const backup = await api('/finance/export?format=backup&month=2026-10', { token: session.token });

    expect(backup.records).toHaveProperty('transaction');
    expect(backup.records).not.toHaveProperty('session');
    expect(JSON.stringify(backup)).not.toContain(session.token);
    expect(JSON.stringify(backup)).not.toContain('passwordDigest');
    expect(backup.records.preference[0]).not.toHaveProperty('androidBiometricEnabled');
  });

  it('restaura um backup mesclando transações e listas sem duplicar os dados de demonstração', async () => {
    const source = await signIn();
    await api('/finance/transactions', {
      token: source.token,
      method: 'POST',
      body: JSON.stringify({ description: 'Conta importada de teste', amountCents: 2345, type: 'expense', date: '2026-10-06', categoryId: 2 })
    });
    await api('/finance/shopping', {
      token: source.token,
      method: 'PUT',
      body: JSON.stringify({ lists: [{ id: 'list_backup_1', month: '2026-10', kind: 'market', name: 'Mercado salvo', items: [] }], stock: [] })
    });
    const backup = await api('/finance/export?format=backup&month=2026-10', { token: source.token });
    backup.records['shopping-state'][0].catalog.push({ id: 'custom-snack', name: 'Biscoito local', kind: 'market', category: 'Mercearia', section: 'Lanches', unit: 'pack' });

    mockStore.state = null;
    const target = await signIn();
    const restored = await api('/finance/restore', { token: target.token, method: 'POST', body: JSON.stringify(backup) });

    expect(restored.importedCount).toBeGreaterThan(0);
    expect(mockStore.state.transactions.filter(row => row.description === 'Conta importada de teste')).toHaveLength(1);
    expect(mockStore.state.shoppingState.lists.filter(row => row.name === 'Mercado salvo')).toHaveLength(1);
    expect(mockStore.state.shoppingState.catalog).toContainEqual({ id: 'custom-snack', name: 'Biscoito local', kind: 'market', category: 'Mercearia', section: 'Lanches', unit: 'pack' });
  });
});
