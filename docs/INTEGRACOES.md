# Integrações presentes e preparadas

## Funcionamento local

Strapi, MySQL, React e Electron operam dentro do dispositivo. A interface e a API usam endereços de loopback. O bundle do frontend não usa CDNs nem carrega fontes, análise de uso, anúncios ou armazenamento remoto. Os componentes visuais usam a identidade local Xitolinos, verde `#A1DC67`, verde escuro `#58AB2F`, cinza `#D9D9D9`, preto `#1A1A1A` e amarelo `#F4D03F`; Inter e Gmarket Sans aparecem como preferência tipográfica com alternativas instaladas no sistema.

## Stripe

O backend mantém o Stripe isolado em `backend/src/integrations/stripe-billing.js`. Checkout cria uma assinatura recorrente e um Customer associado ao cadastro local; o portal permite gerenciar a assinatura. O webhook em `/api/stripe/webhook` valida a assinatura sobre o corpo HTTP original e atualiza estados de assinatura. `BILLING_ENABLED=false`, e as chaves, preço e endereço de retorno ficam vazios em instalação local. Nenhuma conta, cartão de despesa ou lançamento financeiro pessoal é enviado.

A cobrança permanece desligada até existir uma versão online com HTTPS e endpoint público de webhook. Nessa implantação, configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` e `STRIPE_WEB_BASE_URL` no ambiente privado do backend, registre no Stripe os eventos `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed` e `invoice.payment_action_required`, e habilite o Customer Portal. Não ative `BILLING_ENABLED` na versão local, que fica vinculada ao loopback. O acesso ao aplicativo ainda não é bloqueado com base no status da assinatura; essa regra só deve ser definida junto com o lançamento online.

## Importação de documentos

PDF com texto, CSV, texto colado e JSON são lidos no dispositivo. Duplicatas são comparadas por data, valor, estabelecimento e tipo; lançamentos anteriores ao último registro ficam pendentes de confirmação. PDF digitalizado como imagem precisa de OCR local, que não faz parte desta primeira versão.

Open Finance, conexão automática com bancos/cartões e integração com serviços de investimento continuam pendentes. O cadastro atual é manual ou importado pelo usuário.
Nenhuma senha bancária ou número completo de cartão é solicitado ou armazenado.

## Futuras conexões entre aparelhos

O backup JSON exporta as entidades pessoais necessárias para transferência manual e pode ser mesclado noutro aparelho. Sincronização automática exige rede, conflito de alterações, autenticação de dispositivo e chave de criptografia compartilhada; por isso fica inativa no modo offline.

## Segurança local

Strapi confere JWT e perfil proprietário/leitura em cada rota. Proprietário pode usar WebAuthn com verificação obrigatória do autenticador local (por exemplo Windows Hello); alterações, retiradas, fechamento do mês, backup importado e exportação de texto pedem nova confirmação. A chave privada permanece no autenticador e não é exportada no backup. A senha da conta permite recuperar ou remover uma biometria perdida. CORS, MySQL e servidor web estão presos ao loopback.

No modo offline não há entrega de push, email, SMS ou lembretes quando o processo está fechado. Avisos de fechamento, cartão e recebimento aparecem dentro do aplicativo.

Notificações do sistema operacional e sincronização automática entre aparelhos também aguardam uma futura versão conectada. O funcionamento atual não depende dessas conexões.
