import { describe, expect, it } from 'vitest';
import { parseLocalCsv, toShoppingCsv } from './shopping-csv.js';

describe('importação e exportação de lista de compras em CSV', () => {
  it('exporta em UTF-8 com campos escapados e importa o mesmo conteúdo', () => {
    const list = { items: [{ name: 'Sabão; líquido "neutro"', section: 'Limpeza', quantityMilli: 1500, unit: 'un', estimatedCents: 1200, paidCents: 0, status: 'planned' }] };
    const csv = toShoppingCsv(list);
    expect(parseLocalCsv(`\uFEFF${csv}`)).toEqual([
      ['name', 'section', 'quantity', 'unit', 'estimatedCents', 'paidCents', 'status'],
      ['Sabão; líquido "neutro"', 'Limpeza', '1.5', 'un', '1200', '0', 'planned']
    ]);
  });

  it('aceita CSV separado por vírgula e ignora linhas vazias', () => {
    expect(parseLocalCsv('name,section\r\nArroz,Mercearia\r\n\r\n')).toEqual([
      ['name', 'section'], ['Arroz', 'Mercearia']
    ]);
  });
  it('keeps decimal commas in semicolon-separated files', () => {
    expect(parseLocalCsv('name;section;quantity\nArroz;Mercearia;1,5')).toEqual([
      ['name', 'section', 'quantity'], ['Arroz', 'Mercearia', '1,5']
    ]);
  });

});
