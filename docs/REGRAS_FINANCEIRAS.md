# Regras financeiras do Xitolinos

## Valores e lançamentos

- Valores persistidos usam inteiros em centavos.
- Receitas, despesas e transferências são tipos distintos. Transferências entre reservas e contas não contam como renda nem consumo.
- O meio de pagamento pode ser conta, Pix, dinheiro, débito ou cartão.
- Parcelas guardam grupo, número e quantidade; cada parcela aparece na projeção da sua competência. Quitação antecipada registra os valores quitados e retira os compromissos correspondentes dos meses futuros.
- Despesas recorrentes e rendas recorrentes geram ocorrências previstas com data e estado, sem confundi-las com um pagamento já conciliado.
- Lançamentos excluídos são marcados como removidos e permanecem na trilha local de auditoria.

## Projeções e decisões

- O saldo do mês combina saldo líquido das contas, entradas confirmadas ou previstas e saídas confirmadas ou previstas.
- Cobertura de outra fonte é mostrada quando a projeção fica abaixo da margem mínima configurada.
- O simulador de gasto consulta valor, categoria e urgência e aplica respostas determinísticas sobre orçamento, compromissos e reserva. Não usa IA e não substitui decisão do usuário.
- A prévia de delivery usa a mesma capacidade segura calculada para o período de quinta-feira ao fim de semana.
- O aviso de pausa no cartão considera fechamento da fatura, vencimento e antecedência configurada.

## Reservas, fechamento e relatórios

- Reserva de emergência, poupança e investimentos têm saldos, metas e rendimento anual configuráveis.
- O fechamento do mês registra se a fatura foi paga e se um déficit foi coberto por retirada de cada tipo de reserva; esses valores atualizam as projeções.
- Exportações mensais e anuais em texto são formatadas para compartilhamento manual pelo usuário.
- Importação de PDF textual, CSV, texto colado e JSON propõe novos itens após comparar data, valor, descrição e tipo; correspondências duvidosas precisam de confirmação.

As recomendações são estimativas calculadas a partir dos dados cadastrados. O sistema não consulta saldo bancário, não realiza pagamentos e não move dinheiro sem uma ação explícita do usuário.
