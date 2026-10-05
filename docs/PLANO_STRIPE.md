# Plano Stripe do Xitolinos

## Escopo confirmado

O Stripe será usado para cobrar a assinatura do próprio Xitolinos. O Checkout Sessions inicia a assinatura recorrente; o Stripe Billing mantém faturas e renovações; o Customer Portal permite alterar ou cancelar a assinatura. Pagamentos avulsos e Connect não fazem parte do modelo atual: o app não recebe valores em nome de vendedores nem distribui repasses.

## Limites do produto

- A aplicação local continua funcionando sem Internet e mantém `BILLING_ENABLED=false`.
- Contas, cartões, valores, lançamentos e backups pessoais não são enviados ao Stripe.
- Chaves Stripe ficam somente no ambiente privado do backend; nenhuma chave secreta entra no React, no repositório ou em logs.
- Não conceder nem retirar acesso com base na página de retorno do Checkout. A confirmação vem dos eventos assinados e o produto ainda precisa definir regras de acesso para uma futura versão online.

## Fluxo implementado

1. O usuário autenticado pede para assinar; o backend cria ou reutiliza o Customer e associa seu ID ao registro de assinatura pertencente à conta local.
2. O backend cria uma Checkout Session no modo `subscription`, usando o Price configurado no Stripe e redireciona o navegador para a página hospedada pelo Stripe.
3. O Customer Portal abre para o Customer associado e retorna ao endereço HTTPS do app.
4. `/api/stripe/webhook` valida `Stripe-Signature` com o corpo original da requisição. Eventos válidos sincronizam status, período da assinatura e Price com o registro local.

## Antes de habilitar uma versão online

1. Criar produto e preço recorrente no Stripe em modo de teste e configurar o Customer Portal.
2. Guardar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` e `STRIPE_WEB_BASE_URL` apenas no ambiente privado do backend online. Usar chave restrita quando as permissões necessárias forem compatíveis com o fluxo.
3. Publicar o backend por HTTPS e registrar o endpoint `/api/stripe/webhook` para `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed` e `invoice.payment_action_required`.
4. Testar Checkout, cancelamento, renovação, pagamento recusado, evento repetido e assinatura inválida usando dados de teste antes de qualquer ativação de produção.
5. Definir e documentar quais recursos exigem assinatura ativa; só então aplicar essa regra no servidor, preservando a experiência local/offline definida pelo produto.

## Referências oficiais

- [Criar assinaturas com Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions)
- [Webhooks de assinaturas](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Customer Portal](https://docs.stripe.com/customer-management)
- [Gerenciar chaves de API](https://docs.stripe.com/keys)
