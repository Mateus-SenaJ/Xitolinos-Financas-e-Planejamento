# Arquitetura do Xitolinos Planejamento

## Tecnologias

- Interface: React e JavaScript, compilados pelo Vite.
- API: Strapi 5 e JavaScript.
- Banco: MySQL 8.4 local e persistente.
- Desktop: Electron, que inicia e encerra a interface, a API e o banco local.
- Testes: Node.js, Vitest e Playwright.

TypeScript e outros backends não fazem parte desta arquitetura. O produto é para finanças pessoais; não existe cadastro, isolamento ou regra de multi-tenancy por escola.

## Execução local

```text
React/Vite em 127.0.0.1:5173
        ↓ API HTTP local
Strapi em 127.0.0.1:1337
        ↓ mysql2
MySQL em 127.0.0.1:3307
```

O Electron abre a interface React e inicia os serviços locais. A instalação armazena os dados e segredos do banco no perfil local do Windows. Durante o desenvolvimento, o banco fica em `data/mysql`. O cache nativo do SWC fica em `%USERPROFILE%\.cache\xitolinos-swc`.

## Contas e autorização

Cada usuário autenticado é proprietário dos próprios registros. O perfil proprietário cria e altera informações; o perfil de consulta recebe respostas somente de leitura. A API aplica a autorização no servidor, não apenas ocultando controles da interface. Não há isolamento por escola ou organização.

## Migração local

Na primeira inicialização, o backend pode importar `data/finance.sqlite` e `data/store.json`. A origem é aberta somente para leitura, a importação é identificada por um registro de migração e os arquivos originais permanecem no diretório. Backup e restauração usam JSON local, com mesclagem de registros.

## Limites de rede

React, Strapi e MySQL vinculam-se ao loopback. Não há CDN, fonte remota, sincronização automática, chamadas a instituições financeiras ou envio de documentos. O uso de Stripe está desligado no modo local.
