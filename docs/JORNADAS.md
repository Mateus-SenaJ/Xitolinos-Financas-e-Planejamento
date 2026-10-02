# Roteiro de jornadas para validação

1. Acessar com o perfil proprietário; entrar por biometria se já estiver cadastrada.
2. Abrir o mês atual, percorrer a faixa de meses com toque/trackpad e selecionar um mês passado e o seguinte.
3. Adicionar despesa com Pix e outra no cartão em parcelas; conferir próximas faturas e itens detalhados.
4. Marcar uma despesa recorrente como paga e confirmar uma entrada recebida.
5. Conferir o déficit previsto e abrir o fechamento; registrar fatura paga e retirada de poupança ou investimento.
6. Consultar decisão de compra e delivery pelo orçamento, categoria, urgência e saldo do mês.
7. Importar CSV/PDF com texto; verificar deduplicação e selecionar manualmente itens antigos.
8. Exportar mês como texto, salvar backup JSON e restaurar no perfil de consulta em outro diretório vazio.
9. Entrar com o perfil de consulta e confirmar que alterações, retirada e exportação financeira estão indisponíveis.
10. Abrir em 1440×900, 768×1024 e 390×844; conferir rolagem horizontal dos meses, menus e formulários.

O Playwright automatiza as jornadas principais. A verificação com Windows Hello real ainda precisa de confirmação física no computador que instalar o app.
