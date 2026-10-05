# Xitolinos Planejamento — instruções do repositório

Leia estas regras antes de revisar ou alterar o código. Em caso de conflito, a arquitetura e os requisitos financeiros documentados neste repositório prevalecem sobre modelos ou templates externos.

## Fontes de verdade

- `README.md`, `docs/PROJECT_STATE.md`, `docs/ARQUITETURA.md`, `docs/JORNADAS.md`, `docs/REGRAS_FINANCEIRAS.md`, `docs/INTEGRACOES.md` e `docs/DECISIONS.md` definem o produto e seus limites.
- O material de `Para o projeto Xitolinos/layout` é referência visual. Reutilize a identidade e os padrões de tela, adaptando textos e conteúdo ao app de finanças pessoais.
- As skills recebidas com o template são intenções de implementação, não nomes de componentes obrigatórios. Adapte-as ao código existente; não suponha que componentes do template estejam instalados.

## Produto e arquitetura

- Este é um aplicativo pessoal de planejamento financeiro, local e offline. Não introduza escolas, multi-tenancy, hospedagem em nuvem, analytics, fontes remotas, bancos conectados ou serviços externos.
- Preserve o frontend React/Vite, o backend local Strapi/MySQL e o invólucro Electron existentes. Reutilize os fluxos e contratos atuais antes de criar abstrações ou integrações.
- Valores financeiros são armazenados e calculados em centavos. Não altere regras, projeções ou recomendações sem consultar `docs/REGRAS_FINANCEIRAS.md`.
- Preserve privacidade, autenticação local, permissões de consulta e compatibilidade dos dados existentes.

## Interface e identidade visual

- Use a estrutura já existente em `frontend/src/App.jsx`, `styles.css` e `dashboard.css`. Reaproveite o shell autenticado, navegação, cartões, listas e controles existentes antes de criar componentes paralelos.
- Siga as capturas de referência em 1440×900, 768×1024 e 390×844: navegação lateral em telas largas, navegação inferior no celular, cartões arejados e prioridades claras para saldos, previsão de caixa, agenda e lançamentos.
- Use os logos oficiais em `público/brand/` e os tokens de `frontend/src/styles.css`. A identidade usa verde claro `#A1DC67`, verde `#58AB2F`, amarelo `#F4D03F`, cinza `#D9D9D9`, preto `#1A1A1A` e branco `#FFFFFF`. Reserve amarelo para atenção; não use vermelho como cor de alerta.
- Mantenha o tema em CSS e preserve a responsividade e os estados claro/escuro. Valores de largura derivados de dados, como barras de gráficos, podem continuar inline.
- Mantenha rótulos e ajuda em português do Brasil, acessibilidade por teclado e nomes claros para leitores de tela.

## Regras para mudanças

- Antes de adicionar algo, procure o padrão equivalente no frontend ou backend atual. Prefira alterações pequenas que preservem o comportamento existente.
- Não exija `FormCore`, faker, `components/Form/Table`, `parseStrapiImage`, `exposeStrapiError`, `ReadAddressesByZipCode` ou a estrutura `index.js/controller.js/styled.js`: esses contratos pertencem a outro template e não existem aqui.
- Para formulários, tabelas, imagens e respostas da API, preserve os componentes e helpers que este repositório realmente usa. Não adicione busca de CEP ou qualquer chamada remota.
- Mantenha decisões de renderização simples e inline quando isso corresponder ao padrão atual; evite variáveis intermediárias usadas só para props ou JSX.
- Não exponha segredos, senhas, tokens ou dados financeiros pessoais em logs, exemplos ou revisões.
