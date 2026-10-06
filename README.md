# Xitolinos Planejamento

Aplicativo pessoal de controle financeiro local, com interface React, API Strapi, MySQL persistente, autenticação por perfil e versão desktop Electron. A primeira versão é local/offline: não precisa de escolas, nuvem ou serviços financeiros externos.

## Stack

- Backend: Strapi 5 + MySQL 8.4 + JavaScript.
- Frontend: React + Vite + JavaScript.
- Desktop: Electron e uma instância local do aplicativo.
- Android: Capacitor, interface React compartilhada e SQLite no aparelho.
- Dados de entrada: migração de SQLite existente, somente leitura e executada uma vez.

## Começar

Veja [`docs/EXECUCAO_LOCAL.md`](docs/EXECUCAO_LOCAL.md) para instalação, usuários de demonstração, execução pelo Electron e persistência.

## Módulos

Painel e linha do tempo mensal; despesas, rendas e parcelamentos; cartões e fechamento de fatura; despesas recorrentes; recebimentos previstos; contas, reservas e transferências; metas e orçamentos; análise de gasto com respostas fixas; importação local de extratos; exportação WhatsApp em texto; backup/mesclagem JSON; preferências; autenticação por perfil; confirmação WebAuthn; assinatura preparada no Stripe e desligada no modo offline.

## Identidade e código React

A interface usa o manual visual Xitolinos e funciona sem fontes externas. Componentes React seguem a orientação do projeto em [`.agents/skills/xitolinos-reference-review/SKILL.md`](.agents/skills/xitolinos-reference-review/SKILL.md).

## Mais informações

- [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md): Stripe, documentos, segurança e itens que dependem de rede.
- [`docs/ANDROID_READINESS.md`](docs/ANDROID_READINESS.md): construção do APK, módulos Android e limites de sincronização.
- [`docs/JORNADAS.md`](docs/JORNADAS.md): roteiro de jornada e tamanhos de tela.
- [`.livro de histórias/README.md`](.livro%20de%20hist%C3%B3rias/README.md): decisões confirmadas pelo usuário.
