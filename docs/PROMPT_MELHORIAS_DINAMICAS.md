# Prompt de implementação — experiência financeira dinâmica

## Objetivo

Revise e aprimore o Xitolinos Planejamento para que lançamentos, dados iniciais, cartões, recebimentos, calendário, compras e indicadores possam ser configurados e editados com clareza. A experiência deve funcionar na interface web React/Vite e no aplicativo Android Capacitor, mantendo a mesma identidade visual e as regras financeiras do projeto.

## Fontes de verdade e limites

Antes de alterar o código, leia `AGENTS.md`, `README.md`, `docs/PROJECT_STATE.md`, `docs/ARQUITETURA.md`, `docs/JORNADAS.md`, `docs/REGRAS_FINANCEIRAS.md`, `docs/INTEGRACOES.md` e `docs/DECISIONS.md`. Reaproveite componentes e contratos existentes em `frontend/src/App.jsx`, `Settings.jsx`, `styles.css`, `dashboard.css`, `frontend/src/api.js` e `backend/src/finance-api.js`.

- O produto continua local e offline: React/Vite, Strapi/MySQL local, Electron e Capacitor/SQLite. Não crie sincronização remota, conexão bancária, telemetria ou serviço de terceiros.
- Armazene e calcule dinheiro em centavos inteiros. Transferências entre contas e reservas não são renda nem consumo. Projeções não podem ser confundidas com pagamentos confirmados.
- Exclusões devem manter a trilha de auditoria. Resetar lançamentos precisa de confirmação explícita, escopo claro e opção de backup; não apague contas, reservas ou configurações por acidente.
- Preserve autenticação, permissões do perfil de consulta, backups, temas claro/escuro e acessibilidade por teclado e leitor de tela.
- Use verde claro `#A1DC67`, verde `#58AB2F`, amarelo `#F4D03F`, cinza `#D9D9D9`, preto `#1A1A1A` e branco `#FFFFFF`. Amarelo indica atenção; não use vermelho como alerta.

## Mudanças solicitadas

### Lançamentos e dados iniciais

1. Garanta que seja simples abrir, editar, remover e restaurar um lançamento tanto na lista de transações quanto no calendário. Inclua uma ação de restauração para itens removidos e uma ação separada para resetar lançamentos, com aviso sobre o efeito no saldo e confirmação reforçada.
2. Em Definições, crie uma área de início financeiro para informar saldo e data-base de cada conta e saldo inicial de cada reserva. Permita importar extratos antigos pelo fluxo existente, com prévia, deduplicação e confirmação antes de gravar.
3. Permita criar, editar, pausar e reativar despesas fixas e recebimentos previstos. Cartões devem permitir editar nome, limite, conta, dia de fechamento e vencimento sem perder as compras já registradas.
4. Permita cadastrar mais de uma fonte de salário. Cada fonte guarda sua previsão mensal e permite informar o valor efetivamente recebido em cada mês, sem sobrescrever os recebimentos anteriores.
5. Ao tocar/clicar no usuário, abra edição de perfil (nome/foto e preferências pertinentes), não apenas a página geral de definições.

### Formulários confiáveis

1. Revise formulários de movimentações, compras, contas, reservas, cartões, recebimentos, datas e valores.
2. Use um parser monetário compartilhado que aceite digitação em português (por exemplo `1.234,56`) e ponto decimal (`1234.56`) sem multiplicar o valor por 100 indevidamente. Converta para centavos apenas na validação/envio e preserve o texto/cursor durante a digitação.
3. Valide datas reais, valores não negativos/positivos conforme o campo, limites de dia e campos obrigatórios. Mostre erro junto ao campo e não descarte os valores digitados quando houver falha.
4. Use teclado numérico em telas móveis quando adequado, rótulos associados e ajuda breve para campos não óbvios.

### Calendário, navegação e cartões

1. A faixa mensal deve continuar acessível pelas setas e também avançar/voltar com gesto horizontal no touchscreen. Gestos verticais precisam continuar rolando a página.
2. Itens do calendário abrem seus detalhes para edição; o botão de adicionar cria uma movimentação já com a data selecionada.
3. Cards de resumo, cartão e agenda devem abrir a tela de origem com filtro/período coerentes; nenhum elemento com aparência clicável pode ser estático. Ícones sem ação não devem parecer botões.
4. Corrija a aplicação da cor de destaque em botões, foco, itens selecionados, navegação, gráficos e estados claro/escuro. Salve, recarregue e confirme a cor escolhida.
5. Varie hierarquia e peso dos cards: destaque saldos e resultados com superfícies claras; use verde escuro para informações prioritárias e amarelo para déficit, vencimentos e itens que precisam de atenção. Evite pintar todos os cards da mesma cor.

### Compras rápidas

1. O cadastro inicial deve pedir somente o nome do item, com seção sugerida automaticamente e quantidade inicial `1`. Quantidade, unidade e preço devem ser opcionais e editáveis depois.
2. Cada linha deve mostrar, nesta ordem visual: nome do item, quantidade, preço unitário e total calculado como preço × quantidade. O total é somente leitura e deve usar centavos e arredondamento consistentes.
3. No desktop, mantenha ações de status claras e compactas. No mobile/Android, o status deve ficar discreto e aparecer ao tocar/pressionar o item, com opções como não encontrado, comprar em outro lugar ou adiar. Reordene itens por status sem perder a categoria.
4. Mantenha a previsão total visível enquanto a lista rola e atualize-a ao mudar quantidade ou preço.

### Visão geral e recibos

1. Adicione gráfico de linhas histórico com três séries: despesa total, despesa de rotina e despesa extra. Use períodos e datas definidos pelos dados reais; identifique claramente valores realizados e projeções.
2. Adicione gráfico de pizza/anel com a participação das categorias de despesa no mês selecionado, com legenda, valores e alternativa acessível em texto.
3. No formulário de movimentação, permita selecionar/fotografar um recibo ou comprovante de Pix, transferência, pagamento ou retirada. Faça OCR e extração inteiramente local, sem enviar imagem/texto à rede. Para PDFs, tente texto embutido antes de renderizar páginas para OCR.
4. A leitura deve sugerir descrição, valor, data, identificador/código da transação e número do comprovante quando disponíveis. Mostre os dados encontrados para conferência; nada deve ser gravado ou pago automaticamente. Se o texto estiver ilegível ou incompleto, peça correção manual.
5. Documente tipos, tamanho máximo e retenção dos arquivos. Não registre conteúdo de recibos em logs. Não prometa que OCR encontra todos os campos: mostre confiança/ausência e preserve edição manual.

## Padrões de experiência a aplicar

- Entrada progressiva: pedir o mínimo para concluir a tarefa frequente e revelar detalhes opcionais sem bloquear a pessoa.
- Mostrar claramente o que é previsto e o que foi efetivamente pago/recebido.
- Para registros financeiros, favorecer correção/restauração auditável a apagar silenciosamente; para saldos iniciais, registrar data-base.
- Ao importar, apresentar prévia e deduplicação antes de salvar.
- Em telas móveis, usar controles de toque com área suficiente, gestos que não conflitem com a rolagem e ações secundárias em menu contextual.
- Gráficos sempre devem indicar período, unidade monetária e origem dos valores; não usar cor como único meio de diferenciar séries.

Esses padrões foram inspirados em documentação de produtos financeiros sobre saldo inicial, edição/exclusão de transações e anexos/memorandos em transações. As funcionalidades externas servem somente como referência de experiência; não devem trazer sincronização bancária nem serviços online ao Xitolinos.

## Critérios de aceite

- Editar, remover, restaurar e resetar lançamentos atualiza painel, histórico, calendário, totais e projeções sem quebrar auditoria.
- Dados iniciais e preferências continuam corretos depois de fechar e reabrir o app; conta e reserva conservam seu histórico.
- Alterar datas/valores em despesas fixas, cartões e recebimentos não duplica lançamentos anteriores.
- Valores `1234,56`, `1.234,56` e `1234.56` chegam ao domínio como `123456` centavos; datas impossíveis e valores inválidos são rejeitados.
- Um gesto horizontal troca somente um mês; rolagem vertical continua funcionando; o fluxo é utilizável em 390×844 e em telas largas.
- Compras rápidas têm nome como único campo obrigatório; o total não pode ser digitado e coincide com quantidade × preço.
- Cards e ícones levam ao destino correto e os estados de atenção permanecem legíveis nos dois temas e nas três cores de destaque.
- Os gráficos reconciliam seus valores com os mesmos lançamentos usados nos totais do mês e têm resumo textual acessível.
- A imagem/comprovante não sai do aparelho; a extração exige revisão da pessoa antes de salvar e os campos podem ser corrigidos.
- Execute os testes unitários, as jornadas Playwright, build web e APK Android; valide os fluxos móveis em 390×844 quando houver emulador/aparelho disponível.

## Nota de implementação local de comprovantes

O OCR instalado usa Tesseract.js e o modelo português compactado `por.traineddata.gz`, todos copiados para `público/ocr/` e empacotados nos assets web/Android. A rotina não usa CDN e o anexo é limitado a 2 MB depois da otimização de imagem; PDF com até 12 MB pode ser lido, com OCR local em até 3 páginas no formulário. A importação OCR de PDF de extrato aceita até 10 páginas digitalizadas por arquivo. As sugestões são editáveis e precisam de conferência. Anexos são armazenados na base local do app e podem ser exportados/compartilhados pelo próprio aparelho; conteúdo do arquivo é omitido da auditoria. Modelos Apache-2.0/MIT e avisos de licença ficam em `público/ocr/`.

## Referências públicas de experiência

- [YNAB — saldo inicial](https://support.ynab.com/en_us/the-starting-balance-an-overview-H1uozOfJs)
- [YNAB — editar e excluir transações](https://support.ynab.com/en_us/how-to-edit-and-delete-transactions-BJG4oS1s)
- [YNAB — fotos e memorandos nas transações](https://support.ynab.com/en_us/add-context-to-transactions-HyCpTR4bg)
- [Tesseract.js — instalação local de worker, core e dados de idioma](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)

## Nota sobre a consulta ao Claude

Nesta sessão não havia Claude CLI nem conector Claude disponível. Portanto, as recomendações acima não são atribuídas ao Claude; foram organizadas a partir dos requisitos deste projeto, das regras de finanças e das referências públicas listadas.
