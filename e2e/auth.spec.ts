import { test, expect } from '@playwright/test'

test.describe('Auth Flow', () => {
  test('login screen renders', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await expect(page.locator('#loginScreen')).toBeVisible()
    await expect(page.locator('#masterPassword')).toBeVisible()
    await expect(page.locator('#confirmPassword')).toBeVisible()
  })

  test('language buttons exist', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await expect(page.locator('.lang-btn[data-lang="zh-CN"]')).toBeVisible()
    await expect(page.locator('.lang-btn[data-lang="en"]')).toBeVisible()
    await expect(page.locator('.lang-btn[data-lang="de"]')).toBeVisible()
  })

  test('theme dropdown opens', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.locator('#themeToggle').click()
    await expect(page.locator('#themeDropdown')).toHaveClass(/active/)
  })
})
