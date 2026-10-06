import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './receipt-ocr.js';

describe('extração local de dados de comprovantes', () => {
  it('sugere data, valor, código de transação e número do comprovante', () => {
    const result = parseReceiptText(`Comprovante Pix\nMercado Central\nData: 06/10/2026\nValor pago: R$ 1.234,56\nID da transação: E12345678901234567890123456789012\nNúmero do comprovante: PIX-204812`);
    expect(result).toMatchObject({
      description: 'Mercado Central', date: '2026-10-06', amountCents: 123456,
      transactionCode: 'E12345678901234567890123456789012', receiptNumber: 'PIX-204812'
    });
  });

  it('deixa campos sem correspondência vazios e rejeita datas impossíveis', () => {
    expect(parseReceiptText('Recibo\nData: 31/02/2026\nPagamento confirmado')).toMatchObject({ date: '', amountCents: null, transactionCode: '', receiptNumber: '' });
  });
});
