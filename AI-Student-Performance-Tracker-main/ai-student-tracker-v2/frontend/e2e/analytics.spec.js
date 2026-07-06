import { test, expect } from '@playwright/test'
import { loginAsDemo } from './helpers.js'

test('analytics page loads ML overview', async ({ page }) => {
  await loginAsDemo(page)
  await page.getByRole('link', { name: /^analytics$/i }).click()
  await expect(page).toHaveURL(/\/analytics/)
  await expect(page.getByRole('heading', { name: /^analytics$/i })).toBeVisible()
  await expect(page.getByText(/class average/i)).toBeVisible()
  await expect(page.getByText(/risk factor breakdown/i)).toBeVisible()
})
