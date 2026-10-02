import { describe, expect, it } from 'vitest';
import { parseStatementText } from './api.js';

describe('leitura local de extratos em texto', () => {
  it('converte datas brasileiras, valores e descrições em lançamentos', () => {
    expect(parseStatementText('09/09/2026 Farmácia Drogasil Salvador R$ 34,90\n10/09/2026 Pix recebido -120,00')).toEqual([
      { date: '2026-09-09', description: 'Farmácia Drogasil Salvador', amountCents: 3490, type: 'expense', method: 'account' },
      { date: '2026-09-10', description: 'Pix recebido', amountCents: 12000, type: 'income', method: 'account' }
    ]);
  });

  it('ignora linhas sem valor e não cria lançamentos de valor zero', () => {
    expect(parseStatementText('Saldo anterior 50,00\n11/09 Mercado 0,00')).toEqual([]);
  });
});
