import { expect } from '@playwright/test'

export async function loginAsDemo(page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /fill demo credentials/i }).click()
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/(dashboard)?/, { timeout: 30_000 })
}
