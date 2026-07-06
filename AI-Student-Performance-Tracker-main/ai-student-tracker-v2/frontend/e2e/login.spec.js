import { test, expect } from '@playwright/test'

test('login page shows demo credentials and can sign in', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible()
  await expect(page.getByText('demo@school.com / demo')).toBeVisible()

  await page.getByRole('button', { name: /fill demo credentials/i }).click()
  await expect(page.locator('input[type="email"]')).toHaveValue('demo@school.com')

  await page.getByRole('button', { name: /^sign in$/i }).click()

  await expect(page).toHaveURL(/\/(dashboard)?/, { timeout: 30_000 })
})
