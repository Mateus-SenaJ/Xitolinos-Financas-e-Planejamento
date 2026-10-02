# Validação e qualidade

## Comandos

```powershell
npm test
npm run build:web
npm run build:api
npm run test:e2e
npm run desktop:package
```

## Cobertura automatizada

- Testes unitários do motor financeiro: projeções, recorrências, parcelas, alertas, reservas e capacidade segura de gasto.
- Testes do frontend: API local, importação e formatos financeiros.
- Jornadas Playwright: autenticação do proprietário, navegação dos módulos, criação e remoção lógica de lançamento, perfil de consulta e layouts de 768 px e 390 px.
- A compilação de produção verifica o bundle React e o painel administrativo Strapi.

Os testes usam contas locais de demonstração. Os lançamentos temporários são removidos logicamente ao fim da jornada; os registros de demonstração e os arquivos de origem SQLite/JSON são mantidos.
