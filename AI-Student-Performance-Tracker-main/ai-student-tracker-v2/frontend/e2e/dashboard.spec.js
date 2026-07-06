import { test, expect } from '@playwright/test'
import { loginAsDemo } from './helpers.js'

test('dashboard loads after login with risk overview', async ({ page }) => {
  await loginAsDemo(page)

  await expect(page.getByRole('heading', { name: /good to see you/i })).toBeVisible()
  await expect(page.getByText(/live class health/i)).toBeVisible()
})

test('can navigate to students page from sidebar', async ({ page }) => {
  await loginAsDemo(page)

  await page.getByRole('link', { name: /^students$/i }).click()
  await expect(page).toHaveURL(/\/students/)
  await expect(page.getByRole('heading', { name: /^students$/i })).toBeVisible()
})
