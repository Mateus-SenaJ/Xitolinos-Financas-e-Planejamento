import { test, expect } from '@playwright/test';

async function loginAsOwner(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Continuar para o aplicativo' }).click();
  await expect(page.getByRole('heading', { name: 'Seu plano financeiro' })).toBeVisible();
}

test('proprietário consulta módulos, cria e remove um lançamento local', async ({ page }) => {
  await loginAsOwner(page);
  await expect(page.getByRole('heading', { name: 'Despesas contabilizadas' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Meses do planejamento' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Previsão de caixa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Agenda financeira' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reservas e objetivos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Posso pedir delivery?' })).toBeVisible();

  for (const [navigation, heading] of [
    ['Planejamento', 'Planejamento'], ['Reservas', 'Reservas e investimentos'], ['Metas', 'Metas financeiras'],
    ['Importar extrato', 'Importar extrato'], ['Posso gastar?', 'Posso fazer esse gasto?'], ['Definições', 'Definições']
  ]) {
    await page.getByRole('button', { name: navigation, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  const description = `Verificação local ${Date.now()}`;
  await page.getByRole('button', { name: 'Visão geral' }).click();
  await page.getByRole('button', { name: 'Adicionar despesa', exact: true }).first().click();
  await page.getByLabel('Descrição').fill(description);
  await page.getByLabel('Valor total').fill('12,34');
  await page.getByLabel('Forma').selectOption('pix');
  await page.getByRole('button', { name: 'Salvar no meu plano' }).click();
  await expect(page.getByText(description)).toBeVisible();

  page.once('dialog', async dialog => dialog.accept());
  await page.getByRole('button', { name: `Remover ${description}` }).click();
  await expect(page.getByText(description)).toHaveCount(0);
});

test('perfil de consulta não recebe controles que alteram dados', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill('consulta@xitolinos.local');
  await page.getByLabel('Senha').fill('Xitolinos-Demo-2026!');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await page.getByRole('button', { name: 'Continuar para o aplicativo' }).click();
  await expect(page.getByRole('heading', { name: 'Seu plano financeiro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar despesa' })).toHaveCount(0);
  await expect(page.getByText('Acesso para consulta')).toBeVisible();
});

for (const viewport of [{ width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`painel acessível e navegável em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loginAsOwner(page);
    await expect(page.getByRole('heading', { name: 'Seu plano financeiro' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adicionar despesa' }).last()).toBeVisible();
    if (viewport.width < 700) {
      await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Extrato' }).click();
      await expect(page.getByRole('heading', { name: 'Despesas e rendas' })).toBeVisible();
    }
    await page.screenshot({ path: `test-results/layout-${viewport.width}.png`, fullPage: true });
  });
}
