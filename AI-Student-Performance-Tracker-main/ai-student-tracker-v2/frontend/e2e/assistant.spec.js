import { test, expect } from '@playwright/test'
import { loginAsDemo } from './helpers.js'

test('AI assistant page loads with suggested prompts', async ({ page }) => {
  await loginAsDemo(page)
  await page.getByRole('link', { name: /ai assistant/i }).click()
  await expect(page).toHaveURL(/\/assistant/)
  await expect(page.getByRole('heading', { name: /ai assistant/i })).toBeVisible()
  await expect(page.getByText(/show high risk students/i)).toBeVisible()
})
