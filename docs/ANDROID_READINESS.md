# Aplicativo Android

## Implementação

O Android usa Capacitor para empacotar a mesma interface React responsiva de `frontend/src/App.jsx`, `frontend/src/styles.css` e `frontend/src/dashboard.css`. A navegação, cartões, listas, formulários, temas e módulos são compartilhados com a versão web; o projeto nativo fica em `frontend/android/`.

No Android, `frontend/src/api.js` seleciona o adaptador local em `frontend/src/mobile/api.js`. Esse adaptador conserva os fluxos e os valores em centavos, aplica os perfis proprietário e consulta, e persiste o estado no SQLite do aparelho por `@capacitor-community/sqlite`. A biometria usa o autenticador nativo; exportações e backups são compartilhados pelo seletor do Android.

O APK é local e offline. Ele compartilha código e aparência com o site, mas não compartilha automaticamente banco, sessão nem alterações com Strapi/MySQL ou com o site. Para levar dados do site ao aparelho, exporte um backup JSON local e restaure-o em Definições; use o mesmo processo no sentido inverso. Não existe sincronização em tempo real.

## Recursos e limites

- Painel, fluxo de caixa, histórico de movimentações, calendário, cartões, faturas e fechamento mensal.
- Planejamento, despesas recorrentes, recebimentos, contas, reservas, metas, orçamentos e preferências.
- Compras, estoque, catálogo genérico, histórico, previsão, CSV e registro explícito da compra como despesa.
- Importação de texto, CSV, JSON e PDF com texto selecionável; OCR local de imagens e PDFs digitalizados continua indisponível.
- Avisos aparecem dentro do aplicativo. Push ou lembretes com o processo fechado não fazem parte do modo offline.
- Cobrança Stripe e portal online permanecem desligados.

O aplicativo inicia com contas locais de demonstração. As credenciais podem ser consultadas em `frontend/src/mobile/seed-state.js`; elas não são as contas da versão web. Os dados financeiros são guardados no aparelho e não são incluídos no backup junto com senhas, sessões ou configuração biométrica.

## Construção

Na raiz do repositório, instale as dependências com `yarn install`; no diretório `frontend`, compile e sincronize com `npm run android:sync`. Com JDK 21 e Android SDK Platform 36 e Build Tools 36 instalados, gere o APK de depuração:

```text
cd frontend/android
./gradlew assembleDebug
```

No Windows, use `gradlew.bat assembleDebug`. O APK de teste sai em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`; ele usa a assinatura de depuração do Android e não é uma versão para publicação na Play Store.

## Validação

Os testes da API móvel estão em `frontend/src/mobile/api.test.js`; o restante da suíte frontend roda com `npm test -- --reporter=dot` no diretório `frontend`.

Nesta entrega, `npm run build:android` concluiu, a suíte frontend passou (10 testes), `assembleDebug` gerou o APK e `testDebugUnitTest` terminou com sucesso. A assinatura v2 do APK foi verificada. O pacote declara somente as permissões biométricas e uma permissão interna de receiver; não declara acesso à Internet. O APK de depuração foi gerado em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

Ainda falta validar em aparelho ou emulador. Essa verificação deve cobrir entrada, persistência SQLite após reinício, perfil secundário, biometria, importação, exportação/compartilhamento e navegação em 390×844. A compilação e os testes automatizados, por si só, não confirmam esses fluxos em um dispositivo real.
