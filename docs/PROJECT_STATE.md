# Estado do projeto

O produto tem interface React responsiva, API Strapi, persistência MySQL local, shell Electron, autenticação com perfis, dados de demonstração e os módulos de lançamentos, planejamento mensal, cartões, receitas, reservas, metas, importação, dúvidas financeiras, notificações locais e definições.

A tela inicial segue a identidade Xitolinos e o layout de referência: cartões de meses com toque e clique, despesas contabilizadas do mês, previsão de caixa, agenda, reservas, pergunta de delivery, transações recentes e navegação móvel.


A interface inicial inclui cartões verdes de destaque, controle para ocultar saldos e projeções, previsão de déficit e classificação de despesas como rotina ou fora da rotina. A classificação não remove despesas dos totais financeiros.

O módulo local de compras oferece listas por mês e tipo, catálogo genérico, histórico, estoque, previsão e CSV no dispositivo. A importação não cria uma despesa por padrão; a contabilização exige ação explícita e o lançamento associado impede edições posteriores da lista.

Dados SQLite/JSON anteriores são preservados e importados uma vez para o perfil local. A cobrança Stripe, notificações fora do aplicativo, OCR de PDF escaneado, Open Finance e sincronização pela rede não estão ativos no modo local.

Para os comandos e a cobertura de validação, consulte `EXECUCAO_LOCAL.md` e `QA.md`.
