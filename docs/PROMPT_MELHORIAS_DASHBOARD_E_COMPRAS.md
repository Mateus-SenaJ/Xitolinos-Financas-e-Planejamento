# Prompt de implementação — Dashboard financeiro e módulo de compras

Use o texto a seguir como solicitação de implementação no repositório Xitolinos Planejamento. Anexe novamente as duas imagens de referência se o agente não tiver acesso às imagens desta conversa.

---

## Prompt

Implemente as melhorias descritas neste documento no aplicativo Xitolinos Planejamento. Antes de editar, examine o código e a documentação atuais para identificar o que já funciona, o que precisa de correção e quais estruturas podem ser reaproveitadas. Preserve os fluxos existentes e entregue funcionalidades reais, sem deixar botões decorativos ou simulações apresentadas como dados persistidos.

### 1. Fontes de verdade e precedência

Leia `AGENTS.md`, `README.md`, `docs/PROJECT_STATE.md`, `docs/ARQUITETURA.md`, `docs/JORNADAS.md`, `docs/REGRAS_FINANCEIRAS.md`, `docs/INTEGRACOES.md` e `docs/DECISIONS.md`. Consulte também `.agents/skills/xitolinos-reference-review/SKILL.md` e as skills adaptadas necessárias para reuso de componentes, navegação, temas e formulários.

Em caso de conflito, siga a arquitetura, as regras financeiras e as instruções do repositório. As skills de `Para o projeto Xitolinos/Estrutura Padrão` são intenções reutilizáveis; não transplante a arquitetura de outro template. Não introduza `FormCore`, faker, `components/Form/Table`, arquivos `index.js/controller.js/styled.js`, helpers ou integrações que não existem nesta base.

As duas imagens anexadas e as referências disponíveis em `C:\Users\mateu\Desktop\Para o projeto Xitolinos\layout` são visuais: a primeira mostra cartões verde-escuros com gradiente, volume e detalhe geométrico; a segunda mostra a identidade, a hierarquia e o menu lateral. Use somente esses aspectos visuais. Não copie textos ou funções que não pertençam ao produto financeiro. Reutilize os logos oficiais já presentes em `público/brand/`.

### 2. Arquitetura que deve ser preservada

- Frontend em React, JavaScript e Vite; API local em Strapi/JavaScript; MySQL local; aplicativo desktop em Electron.
- Mantenha a aplicação pessoal, local e utilizável sem Internet. Não adicione hospedagem em nuvem, sincronização de rede, analytics, CDN, fontes remotas, bancos conectados ou serviços externos.
- Reaproveite `frontend/src/App.jsx`, `frontend/src/Settings.jsx`, `frontend/src/styles.css`, `frontend/src/dashboard.css`, `frontend/src/api.js`, `backend/src/finance-api.js`, `backend/src/finance-engine.js` e os modelos e serviços existentes. Examine `backend/src/api/desired-purchase/` antes de modelar compras. Procure componentes, fluxos e modelos equivalentes antes de criar novos.
- Não mova arquivos para a estrutura de outro template. Não substitua nem duplique telas, shell, navegação, formulários, notificações ou regras que já existam.
- Mantenha textos, rótulos e ajuda em português do Brasil, navegação por teclado, nomes acessíveis para leitores de tela e suporte aos temas claro e escuro.
- Valores financeiros continuam armazenados e calculados em centavos. Consulte `docs/REGRAS_FINANCEIRAS.md` antes de alterar saldos, projeções, totais, parcelas, recorrências ou recomendações. Preserve compatibilidade com os dados locais existentes.
- A API deve autorizar cada operação no servidor. Ocultar um botão não substitui controle de acesso.

### 3. Identidade visual e navegação

Amplie com moderação o estilo dos cartões verdes das referências para os pontos de maior destaque do dashboard. Use a paleta já definida em `frontend/src/styles.css`: verde-claro `#A1DC67`, verde `#58AB2F`, amarelo `#F4D03F`, cinza `#D9D9D9`, preto `#1A1A1A` e branco `#FFFFFF`. Tons mais escuros derivados do verde podem compor o gradiente. Mantenha texto legível e contraste adequado; amarelo indica atenção e vermelho não deve ser usado como alerta.

No CSS, centralize cores e variações em propriedades customizadas e use notação hexadecimal (`#RRGGBB` ou `#RRGGBBAA`) para valores de cor. Preserve a separação entre `styles.css` e `dashboard.css`; não espalhe estilos inline, exceto valores visuais calculados a partir de dados quando o padrão existente já os usa.

Atualize os elementos abaixo sem tornar a tela pesada:

1. Aplique uma variação discreta do efeito verde ao item selecionado do menu lateral nos temas claro e escuro.
2. Destaque o cartão do mês selecionado com o mesmo vocabulário visual, mantendo os demais meses fáceis de comparar.
3. Use o tratamento visual em poucos cartões importantes do dashboard, incluindo a nova previsão de déficit.
4. Mantenha o logo no alto do menu e mova o bloco com usuário e plano para o rodapé do menu. Em telas largas, preserve o menu lateral; no celular, preserve a navegação inferior já existente.
5. Torne a frase de boas-vindas compacta e dinâmica, com base nos dados e na situação real do mês. Não diga que o mês está bem se a projeção indicar déficit ou compromissos atrasados. Evite ocupar várias linhas em telas estreitas.
6. Coloque a ação **Fechar mês** imediatamente à esquerda de **Adicionar movimentação** nas telas em que ambas aparecem. Em celulares, preserve alvos de toque e não cubra conteúdo.

### 4. Privacidade de valores e visão financeira

Adicione um controle de olho na parte superior da área autenticada. Um único comando deve ocultar ou revelar os saldos reais, valores disponíveis e projeções financeiras nas telas e cartões que usam a visibilidade global. Mantenha os valores de despesas visíveis, inclusive nos cartões do dashboard. O estado oculto não deve reaparecer em tooltips, textos acessíveis ou resumos visuais que mostrem o mesmo valor. O botão deve ter rótulo acessível que indique a ação e funcionar por teclado.

Inclua no dashboard um cartão **Déficit previsto** (ou rótulo equivalente) que mostre quanto faltará para cobrir as despesas do período quando o saldo projetado for negativo. Reaproveite a projeção existente no motor financeiro; não crie uma fórmula paralela nem subtraia valores duas vezes. Quando não houver déficit, comunique isso claramente sem mostrar um número negativo como falta.

Permita analisar despesas de rotina mensal separadas de despesas fora da rotina, como viagens e gastos ocasionais. Use uma classificação explícita que possa ser ajustada pelo usuário. O filtro deve facilitar a análise diária, mas despesas fora da rotina continuam fazendo parte dos totais financeiros e das projeções gerais; não as exclua silenciosamente.

Renomeie a ação principal para **Adicionar movimentação**. Ela deve encaminhar o usuário ao fluxo apropriado para registrar uma despesa, um recebimento, uma transferência ou outro planejamento que o sistema já suporte, como meta ou reserva. Preserve os tipos e contratos financeiros existentes em vez de salvar tudo como uma despesa genérica.

### 5. Verificação de importação e avisos locais

Audite o fluxo de importação existente, incluindo a interface de importação, a API local e a deduplicação. Verifique o comportamento real ao selecionar um CSV, PDF com texto e imagem ou PDF digitalizado. A prévia deve atualizar depois da seleção, informar o resultado e deixar o usuário revisar itens ambíguos antes de gravar. Duplicatas não podem virar despesas duplicadas.

O produto documenta leitura local de CSV e PDF textual; OCR de imagem/PDF digitalizado ainda não está ativo. Se for viável incluir OCR, use somente uma solução que funcione no dispositivo, sem enviar extratos à Internet. Se isso não puder ser entregue com segurança e compatibilidade, mantenha os limites explícitos na interface e na documentação; não afirme que o OCR está funcionando sem validar um arquivo de teste.

Verifique também os avisos locais de fechamento do mês, vencimento de cartão e recebimentos. Confira se as preferências persistem, se os dias de fechamento e vencimento são usados nos cálculos, se os lembretes respeitam a antecedência configurada e se as datas permanecem corretas nos limites dos meses. Os avisos continuam dentro do aplicativo; não adicione push, e-mail ou SMS.

### 6. Novo módulo de compras

Adicione uma área **Compras** à navegação existente, incluindo a navegação móvel. Antes de criar modelos, examine `backend/src/api/desired-purchase/` e os demais componentes e serviços existentes; estenda estruturas adequadas quando isso evitar duplicação.

O módulo deve permitir:

- Criar listas separadas de **Mercado**, **Farmácia** e **Outras compras** para cada mês.
- Reutilizar itens salvos e itens adicionados manualmente em uma nova lista sem apagar o histórico dos meses anteriores.
- Manter cada item com nome, seção/categoria, quantidade, unidade, preço estimado, preço pago e estado de compra.
- Marcar itens, com cor e rótulo acessível, como não encontrados, para comprar em outro lugar, adiados ou estados equivalentes. Agrupe os itens marcados no início da lista, em seções identificadas pelo estado. A cor nunca deve ser a única indicação.
- Exibir no topo uma previsão compacta do total. Atualize-a conforme quantidades e preços forem alterados e mantenha o resumo visível durante a rolagem sem consumir espaço excessivo no celular.
- Consultar o histórico de compras anteriores por mês e produto. Quando houver uma compra anterior comparável, indique discretamente se o preço unitário subiu ou caiu e mostre o último preço como referência. Normalize unidade e quantidade antes de comparar; se não houver comparação confiável, informe que não há histórico comparável.
- Manter um estoque doméstico editável. Com base nos itens e quantidades que o usuário já registrou, sugerir itens e quantidades para a próxima lista. Mostre as sugestões como editáveis; não faça compras nem altere o estoque automaticamente.
- Oferecer um catálogo local, genérico e editável de itens comuns de supermercado e farmácia, organizado por seção e sem marcas. Não carregue catálogos ou imagens pela Internet.

### 7. Conta principal, permissões e CSV

Respeite o modelo de autenticação e os perfis locais já existentes. O perfil proprietário/admin pode configurar o acesso dos demais perfis às áreas e ações permitidas, dentro do modelo atual. Reaproveite o perfil de consulta quando adequado. Se forem necessárias permissões por módulo, aplique-as também na API e no escopo dos dados, com padrão restritivo; não permita alteração ou leitura financeira apenas porque um controle foi escondido na interface.

O pedido de sincronização com a conta principal deve funcionar offline na primeira versão por importação e exportação local de CSV. Não implemente sincronização entre aparelhos ou compartilhamento pela rede. Se a intenção exigir acesso simultâneo ou sincronização automática entre contas, registre a limitação arquitetural em vez de abrir uma conexão remota ou criar multi-tenancy.

O CSV deve ter prévia antes da importação e controles para escolher entre:

1. guardar os dados somente no histórico/lista de compras, sem contabilizar como despesa financeira; ou
2. registrar explicitamente a compra no financeiro existente, vinculando os itens importados e evitando duplicidade numa nova tentativa.

Não conte a compra como despesa por padrão sem confirmação. Faça importação/exportação no dispositivo e não inclua senhas, tokens ou dados que não sejam necessários.

### 8. Integridade, acessibilidade e validação

Preserve os registros existentes, os perfis proprietário/consulta, as trilhas de auditoria e a regra de que pagamentos não são executados pelo aplicativo. Não exponha valores financeiros pessoais em logs. Não conecte o Stripe nem altere sua configuração desligada no modo offline.

Após a implementação, valide os fluxos afetados usando os testes e comandos já presentes no repositório. Inclua cobertura para a visibilidade dos valores, projeção de déficit, separação de despesas de rotina e extraordinárias, fechamento/vencimentos/recebimentos, importação e deduplicação, permissões no servidor, CSV sem e com contabilização e histórico de compras. Faça revisão visual nos tamanhos 1440×900, 768×1024 e 390×844, em tema claro e escuro. Não use dados financeiros reais nos testes.

Ao concluir, informe os arquivos alterados, o que foi implementado, o que foi testado e qualquer limite que permaneça — principalmente o OCR e a sincronização entre contas. Atualize a documentação quando um comportamento ou limite do produto mudar.

---
