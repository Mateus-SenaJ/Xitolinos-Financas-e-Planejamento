# Saldo Android (Python)

Camada móvel Android construída em paralelo à aplicação web existente. O núcleo em `app/` não importa Kivy: regras, SQLite, repositories, serviços e testes podem ser reaproveitados por outra interface Python.

## Estado desta entrega

Entregue como fundação Android/Fase 1: interface Kivy com cinco destinos, lançamento rápido de receita/despesa/transferência, contas, categorias iniciais, histórico, dashboard realizado, SQLite offline, saldo por conta, Lixeira lógica, auditoria, preferências de margem/horizonte e proteção local por PIN.

Ainda não são funcionalidades disponíveis: cartões/faturas/parcelas, ForecastEngine, dinheiro livre, análise de compra, recorrências, reservas/investimentos como eventos, importação PDF/CSV/OFX, notificações, fechamento, relatórios analíticos, backup/restore e autenticação biométrica Android. A interface mostra estados pendentes em vez de inventar resultados.

## Arquitetura

```text
Kivy UI → application services → domain/core → repositories → SQLite local
```

- `app/core/`: centavos, datas, Clock, enums, erros e PIN.
- `app/models/`: dataclasses imutáveis.
- `app/database/`: SQLite, índices e schema versionado compatível com o esquema v4 do projeto web.
- `app/repositories/`: SQL isolado da interface e dos serviços.
- `app/services/`: transações, ledger e configurações centralizadas.
- `app/ui/`: telas/widgets Kivy; não contém fórmulas financeiras.
- `tests/`: unittest sem dependência de Kivy.

O Android cria o banco em `App.user_data_dir/saldo.sqlite3`, dentro do sandbox privado da aplicação. É offline e não sincroniza automaticamente com o banco da versão web/Desktop. Uma transferência de dados entre plataformas exige futura exportação/importação validada.

## Ambiente Android

Buildozer/python-for-Android deve ser executado em Linux (ou WSL2 com uma distribuição Linux configurada), com Python 3.11 compatível com Kivy, JDK e SDK/NDK Android instaláveis pelo Buildozer. No diretório `android_app`:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt buildozer
python -m unittest discover -s tests -v
buildozer android debug
buildozer android release
```

O release está configurado para AAB em `buildozer.spec`. A geração do pacote não foi executada nesta máquina Windows: Python funcional, Java, Android SDK/ADB, Gradle e Buildozer não estão disponíveis aqui. Faça a primeira compilação e teste em emulador/dispositivo Android antes de distribuir.

## Segurança e privacidade

- PIN local de 6 a 12 dígitos derivado com PBKDF2-HMAC-SHA256, salt aleatório, comparação em tempo constante e espera após cinco tentativas incorretas.
- O aplicativo volta à tela de PIN ao entrar em background.
- Não armazena senha bancária, credenciais bancárias ou PAN de cartão.
- SQLite usa o sandbox do Android, mas **não está criptografado em repouso** nesta versão. PIN protege a UI; não deve ser interpretado como criptografia do arquivo.
- Biometria não está conectada. O app não simula sucesso biométrico e informa a indisponibilidade; a integração AndroidX requer implementação e validação em dispositivo.
- Backups Android são desabilitados no manifesto do Buildozer; backup/restore controlado ainda será implementado.

## QA conhecido

`python -m unittest discover -s tests -v` cobre centavos, transferência, saldo, exclusão lógica/restauração, auditoria, PIN/lockout e compatibilidade do esquema. Os testes foram escritos, mas não puderam ser executados neste ambiente porque o comando `python` encaminha para a Microsoft Store sem um runtime instalado. QA visual Kivy e compilação APK/AAB também pendem de toolchain/dispositivo Android.