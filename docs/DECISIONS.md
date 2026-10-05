# Decisões de produto e implementação

1. O projeto mantém React com JavaScript no frontend e Strapi com JavaScript no backend.
2. MySQL 8.4 guarda os dados locais de forma persistente; SQLite e JSON existentes servem apenas como fontes preservadas de migração.
3. A primeira entrega roda sem rede e vincula os serviços ao loopback. Transferência entre aparelhos ocorre por backup local, não por sincronização automática.
4. Os perfis são proprietário e consulta. O produto é para finanças pessoais, sem multi-tenancy por escola.
5. Electron é a camada de desktop e usa armazenamento do perfil local do Windows quando empacotado.
6. Stripe fica preparado para assinatura do aplicativo, mas a cobrança e os webhooks permanecem desligados até haver uma versão conectada à Internet.
7. Recomendações de gasto usam regras financeiras fixas e exibem a justificativa baseada nos dados cadastrados.
8. Stripe atende apenas a assinatura do Xitolinos. Connect não é usado porque o produto não recebe pagamentos em nome de vendedores nem distribui repasses.
