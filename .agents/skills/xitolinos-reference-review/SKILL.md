---
name: xitolinos-reference-review
description: Review frontend work against Xitolinos project documentation, the supplied layout references, and adapted Agent skills.
---

# Revisão de telas Xitolinos

Use esta skill ao revisar ou alterar `frontend/src/**`, `frontend/index.html` ou os assets de interface. Consulte também `AGENTS.md` e, conforme a área, as fontes de verdade em `docs/`.

## Referências integradas

Esta skill incorpora as intenções de `build-screen-from-figma`, `reuse-existing-components`, `use-header-sidebar-layout`, `use-formcore-with-faker`, `keep-theme-logic-in-styled`, `keep-render-logic-inline`, `follow-existing-examples-first`, `fill-address-from-zip-code-service`, `use-project-table` e `use-strapi-image-and-error-helpers`, recebidas em `Para o projeto Xitolinos/Estrutura Padrão`. O produto atual tem outra base; aplique as regras equivalentes abaixo e não exija APIs do template que não existem.

## Aplicação no código atual

- Compare o conteúdo e a hierarquia visual com os layouts fornecidos: visão geral financeira, navegação lateral no desktop, navegação inferior no celular e blocos para caixa, agenda, reservas e histórico. Preserve os fluxos reais do produto; textos de CRM ou escolas do template não se aplicam.
- Antes de criar componentes, procure usos em `frontend/src/App.jsx`, `frontend/src/Settings.jsx`, `frontend/src/DeviceUnlock.jsx`, `frontend/src/styles.css` e `frontend/src/dashboard.css`. Reutilize o shell, listas e cartões existentes.
- Centralize cores e aparência em CSS e nos tokens existentes. Preserve tema claro/escuro. Não crie nova paleta, não use vermelho como alerta e use amarelo da marca para estados de atenção.
- Mantenha renderização e props simples; não crie variáveis `resolvedX`, `defaultX`, `hasX` ou `computedX` apenas para JSX. Valores visuais derivados de dados, como largura de barras, continuam válidos.
- Mantenha os formulários e listas nos padrões já presentes no app. Não force `FormCore`, faker ou `components/Form/Table` de outra base.
- Para imagens e erros, use os assets e helpers que existem neste repositório. Não invente `parseStrapiImage` ou `exposeStrapiError`; não use URLs remotas nem adicione integração de CEP.
- Preserve API local, privacidade, valores em centavos, autenticação e comportamento responsivo. Ao revisar, priorize regressões funcionais, financeiras, de acesso e de layout sobre diferenças cosméticas pequenas.
