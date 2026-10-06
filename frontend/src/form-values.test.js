import { describe, expect, it } from 'vitest';
import { formatCentsForInput, isRealDate, parseMoneyToCents } from './form-values.js';

describe('valores de formulário financeiros', () => {
  it.each([
    ['1234,56', 123456],
    ['1.234,56', 123456],
    ['1234.56', 123456],
    ['1,2', 120],
    ['1.234', 123400],
    ['1234', 123400]
  ])('converte %s em centavos sem deslocar a vírgula', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it('formata sem alterar a digitação em progresso', () => {
    expect(formatCentsForInput(123456)).toBe('1234,56');
  });

  it('rejeita valores ambíguos, vazios e datas impossíveis', () => {
    expect(() => parseMoneyToCents('')).toThrow('Informe um valor');
    expect(() => parseMoneyToCents('12,345')).toThrow('duas casas');
    expect(isRealDate('2026-02-28')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
  });
});
