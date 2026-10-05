# Prontidão Android

## Estado

O repositório já contém um aplicativo Android nativo independente em `android_app/`, feito com Kivy, Python e SQLite. Ele cobre os fluxos básicos descritos em `android_app/README.md`, mas não é uma empacotagem da interface React/Electron.

As alterações recentes de dashboard, classificação rotina/extra, lista de compras, estoque, catálogo e CSV são da aplicação React/Strapi. Elas não estão disponíveis na interface Kivy e não são copiadas automaticamente para o banco SQLite Android. Portanto, ainda não existe paridade de funcionalidades entre as duas aplicações.

## Contrato portátil de compras

A interface web pode exportar e importar CSV local em UTF-8 com BOM, separador ponto e vírgula, aspas CSV padrão e estes cabeçalhos:

```text
name;section;quantity;unit;estimatedCents;paidCents;status
```

Os valores monetários são inteiros em centavos. A quantidade é decimal em unidades do produto. `unit` usa `un`, `kg`, `g`, `l`, `ml` ou `pack`; `status` usa `planned`, `purchased`, `not-found`, `buy-elsewhere` ou `postponed`. A versão inicial não contém nome de usuário, token ou credencial. A importação tem prévia; por padrão, mantém os registros somente no histórico de compras. Contabilizar como despesa exige confirmação explícita.

Esse CSV é uma base para transferência manual entre aparelhos, não uma sincronização. O Android ainda precisa de importação/exportação validada, interface de compras, repositórios SQLite e testes próprios antes de consumir o contrato. A classificação de despesas de rotina também ainda precisa ser adicionada ao modelo e aos cálculos nativos.

## Trabalho necessário para paridade

- Implementar lista, estoque e histórico de compras na arquitetura Kivy, serviços e repositórios SQLite.
- Migrar o esquema SQLite com versionamento; manter compatibilidade e isolamento dos dados existentes.
- Validar o contrato CSV no dispositivo, incluindo UTF-8/BOM, valores inteiros, quantidades, estados desconhecidos e duplicidades.
- Implementar classificação rotina/extra no modelo financeiro e nos filtros, mantendo todas as despesas nos totais e projeções.
- Recriar privacidade de valores, déficit projetado, navegação, notificações locais e telas responsivas nativas.
- Executar os testes Python, validar fluxos e acessibilidade em emulador/aparelho e gerar/assinar AAB antes de distribuição.

## Compilação nesta máquina

A análise disponível neste ambiente Windows não encontrou Python funcional, JDK, Android SDK/ADB ou Buildozer. Assim, não foi possível compilar nem validar um APK/AAB aqui. Consulte `android_app/README.md` para a toolchain documentada em Linux/WSL2. Não considere a paridade Android pronta até a portabilidade e a validação em aparelho serem concluídas.

O aplicativo continua local e offline: não deve ser introduzido servidor remoto ou sincronização automática para conectar a versão Android à versão web.
