# Executar o Xitolinos localmente

## Requisitos de desenvolvimento

- Windows 10 ou 11 de 64 bits.
- Node.js 22 e Corepack.
- MySQL Community Server 8.4 instalado no caminho padrão do Windows.
- Para gerar o instalador Electron, o executável `C:\Program Files\nodejs\node.exe` precisa estar disponível.

Depois da instalação inicial das dependências, executar o produto não requer Internet. Instalação e atualização dos pacotes de desenvolvimento podem usar a rede; o aplicativo não faz chamadas financeiras para serviços externos.

## Instalação e inicialização

No PowerShell, na raiz do projeto:

```powershell
corepack yarn install
npm run dev
```

Na primeira inicialização, o script gera senhas aleatórias locais, cria uma instância MySQL isolada em `127.0.0.1:3307` e mantém seus arquivos em `data/mysql`. Strapi atende somente em `127.0.0.1:1337`; Vite atende somente em `127.0.0.1:5173`.

O cache nativo do Strapi fica em `%USERPROFILE%\.cache\xitolinos-swc`. Ele é criado automaticamente para o usuário local e não contém os dados financeiros.

O Electron de desenvolvimento inicia os mesmos serviços automaticamente:

```powershell
npm run desktop
```

Use `npm run dev` e `npm run desktop` em sessões separadas somente se precisar de ambos. O produto instalado inicia e encerra os serviços locais junto com a janela. O MySQL do instalador e as senhas ficam em `%LOCALAPPDATA%\Xitolinos Planejamento`.

Para encerrar o MySQL manualmente durante o desenvolvimento, use `npm run db:stop`. Os dados são mantidos ao parar e reiniciar o servidor. A instância não compartilha nem modifica outro MySQL já ativo em 3307.

## Acesso de demonstração

| Perfil | Usuário | Senha inicial |
|---|---|---|
| Proprietário | `demo@xitolinos.local` | `Xitolinos-Demo-2026!` |
| Consulta | `consulta@xitolinos.local` | `Xitolinos-Demo-2026!` |

O perfil proprietário pode criar e alterar dados. O perfil de consulta não altera registros. Troque a senha inicial antes de usar a aplicação para dados pessoais.

## Desktop Electron

Desenvolvimento:

```powershell
npm run desktop
```

Instalador Windows:

```powershell
npm run desktop:package
```

O instalador coloca as aplicações em recursos locais, inclui o runtime Node atual usado para a API e guarda banco, senhas e arquivos de log em uma pasta local do perfil Windows. MySQL Server 8.4 precisa estar instalado no computador de destino.

## Persistência e migração

- O MySQL local é a fonte principal depois da migração.
- A primeira inicialização importa as contas, categorias, movimentações, orçamentos e metas de `data/finance.sqlite` e `data/store.json` para o perfil proprietário de demonstração.
- As fontes antigas são abertas em modo somente leitura e mantidas no lugar. Uma chave de migração no MySQL evita uma segunda importação automática.
- O MySQL local guarda os registros financeiros, preferências, credenciais públicas de WebAuthn e trilha de auditoria. Arquivos PDF não são enviados ao backend: o texto é lido no navegador local.
- `.env`, SQLite, MySQL e logs permanecem fora do controle de versão.

## Transferir informações entre aparelhos

Enquanto os aparelhos não tiverem rede entre si, use **Definições → Compartilhar e guardar → Baixar backup dos dados** e importe o JSON no segundo aparelho. A restauração mescla os registros, associa as referências novas e preserva o que já existe. Não existe sincronização automática sem um canal de conexão.

## Verificações

```powershell
npm test
npm run test:e2e
npm run desktop:package
```

O teste de jornada usa as contas de demonstração. Registros temporários são marcados como removidos ao concluir o teste; os cadastros iniciais do demonstrativo são mantidos.
