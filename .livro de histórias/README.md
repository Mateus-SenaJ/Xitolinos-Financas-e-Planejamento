# Livro de histórias do Xitolinos

Este diretório registra decisões e o histórico do produto para que mudanças futuras mantenham a finalidade pessoal e local do aplicativo.

## Decisões já confirmadas

- O produto é Xitolinos Planejamento Financeiro Pessoal. Não usa escolas nem isolamento por escola.
- API em Strapi e JavaScript, com MySQL persistente no próprio computador.
- Interface em React e JavaScript. O React segue `.agents/skills/manter-render-inline/SKILL.md`.
- Primeira versão sem dependência de rede externa. A comunicação entre interface e API usa somente `127.0.0.1`.
- O instalador Electron salva banco, senhas e arquivos de auditoria no perfil local do Windows.
- A base SQLite existente é a origem da importação inicial e continua preservada após a migração.
- Stripe serve somente para a assinatura do produto e permanece desligado na versão local.

O prompt mestre fornecido pelo usuário permanece como referência original; não é recriado nem alterado por este resumo.
