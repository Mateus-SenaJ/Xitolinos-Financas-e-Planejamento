import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './receipt-parser.js';

describe('extração local de dados de comprovantes', () => {
  it('sugere data, valor, código de transação e número do comprovante', () => {
    const result = parseReceiptText(`Comprovante Pix\nMercado Central\nData: 06/10/2026\nValor pago: R$ 1.234,56\nID da transação: E12345678901234567890123456789012\nNúmero do comprovante: PIX-204812`);
    expect(result).toMatchObject({
      description: 'Mercado Central', date: '2026-10-06', amountCents: 123456,
      transactionCode: 'E12345678901234567890123456789012', receiptNumber: 'PIX-204812'
    });
  });

  it('reconhece referência Pix E2E alfanumérica sem rótulo', () => {
    const reference = 'A'.repeat(32);
    expect(parseReceiptText(`Comprovante\n${reference}`).transactionCode).toBe(reference);
  });

  it('deixa campos sem correspondência vazios e rejeita datas impossíveis', () => {
    expect(parseReceiptText('Recibo\nData: 31/02/2026\nPagamento confirmado')).toMatchObject({ date: '', amountCents: null, transactionCode: '', receiptNumber: '' });
    expect(parseReceiptText('Comprovante de pagamento\nECO mM\nConta debitada\nPessoa Exemplo').description).toBe('');
  });

  it('lê os campos típicos de um agendamento de resgate com datas por extenso', () => {
    const result = parseReceiptText('C6 BANK\nAgendamento de resgate\nProduto\nCDB de liquidez diária\nValor do resgate\nR$ 1.377,17\nData da solicitação\n03 de Outubro de 2026\nData do resgate\nSegunda-feira, 05 de Outubro de 2026\nID da operação\n01ABCDEFGH2345678901234567');
    expect(result).toMatchObject({ description: 'CDB de liquidez diária', date: '2026-10-05', amountCents: 137717 });
    expect(result.transactionCode).toMatch(/^01[A-Z0-9]{24}$/);
  });

  it('lê o produto quando ele aparece na mesma linha do rótulo', () => {
    expect(parseReceiptText('Agendamento de resgate\nProduto: CDB de liquidez diária').description).toBe('CDB de liquidez diária');
  });

  it('prefere a data indicada como pagamento à data anterior do documento', () => {
    expect(parseReceiptText('Solicitação registrada em 2026-10-03\nData do pagamento:\n05/10/2026').date).toBe('2026-10-05');
  });

  it('associa o valor ao rótulo na linha anterior e não a um saldo maior', () => {
    const result = parseReceiptText('Saldo anterior\nR$ 20.000,00\nValor do resgate\nR$ 1.377,17');
    expect(result.amountCents).toBe(137717);
  });

  it('prioritiza o total final ao subtotal quando os dois valores aparecem', () => {
    const result = parseReceiptText('Subtotal\nR$ 5.000,00\nTotal\nR$ 4.627,67');
    expect(result.amountCents).toBe(462767);
  });

  it('recompõe o código de autenticação dividido em duas linhas e ignora o titular da conta', () => {
    const auth = 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef';
    const result = parseReceiptText('Informações de pagamento\nPagamento efetuado\nR$ 4.627,67\nData do pagamento: 05/10/2026\nCódigo de autenticação\n' + auth.slice(0, 40) + '\n' + auth.slice(40) + '\nPago via\nBanco C6 S.A.\nConta debitada\nPessoa Exemplo\nCPF 000.000.000-00');
    expect(result).toMatchObject({ date: '2026-10-05', amountCents: 462767, transactionCode: auth, description: '' });
  });

  it('associa o rotulo Valor sem usar saldo disponivel', () => {
    expect(parseReceiptText('Valor\nR$ 123,45\nValor dispon\u00edvel\nR$ 23.456,00').amountCents).toBe(12345);
    expect(parseReceiptText('Valor pago\nR$ 123,45\nSaldo dispon\u00edvel\nR$ 23.456,00').amountCents).toBe(12345);
  });

  it('ignora outro cabecalho de campo depois do rotulo Produto', () => {
    expect(parseReceiptText('Agendamento de resgate\nProduto\nValor do resgate\nR$ 100,00').description).toBe('');
  });

  it('prioritiza o total final com subtotal maior na mesma linha', () => {
    const result = parseReceiptText('Subtotal: R$ 5.000,00 / Total: R$ 4.627,67');
    expect(result.amountCents).toBe(462767);
  });

  it('prioriza a data de pagamento antes da data ISO de emissao', () => {
    expect(parseReceiptText('Data do pagamento: 05/10/2026\nData de emissao: 2026-10-03').date).toBe('2026-10-05');
  });

  it('does not append the next field to a split authentication code', () => {
    const auth = 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef';
    const result = parseReceiptText('Codigo de autenticacao\n' + auth.slice(0, 32) + '\n' + auth.slice(32) + '\nData do pagamento: 05/10/2026');
    expect(result.transactionCode).toBe(auth);
  });

  it('preserva o estabelecimento anterior à seção da conta debitada', () => {
    const result = parseReceiptText('Comprovante de pagamento\nPagamento efetuado\nMercado Central\nValor pago\nR$ 75,00\nConta debitada\nPessoa Exemplo\nCPF 000.000.000-00');
    expect(result.description).toBe('Mercado Central');
    expect(parseReceiptText('Comprovante de pagamento\nMERCADO CENTRAL\nConta debitada\nPessoa Exemplo').description).toBe('MERCADO CENTRAL');
    expect(parseReceiptText('Comprovante de pagamento\nUber\nConta debitada\nPessoa Exemplo').description).toBe('Uber');
    expect(parseReceiptText('Comprovante de pagamento\niFood\nConta debitada\nPessoa Exemplo').description).toBe('iFood');
    expect(parseReceiptText('Comprovante de pagamento\nCasa da Silva\nConta debitada\nPessoa Exemplo').description).toBe('Casa da Silva');
  });
});
