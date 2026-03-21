import { test, expect } from '@playwright/test';
import { adminLogin, goToAdmin, navigateToSection } from './helpers';

test.describe('Admin Login & Dashboard', () => {
    test('should show login page', async ({ page }) => {
        await page.goto('/admin-login');
        await expect(page.locator('.login-title')).toHaveText('Admin Girişi');
        await expect(page.locator('#loginForm')).toBeVisible();
    });

    test('should reject wrong credentials', async ({ page }) => {
        await page.goto('/admin-login');
        await page.fill('#username', 'admin');
        await page.fill('#password', 'wrongpassword');
        await page.click('#loginBtn');
        await expect(page.locator('#errorMessage')).toBeVisible();
        await expect(page.locator('#errorMessage')).toHaveClass(/show/);
    });

    test('should login with correct credentials', async ({ page }) => {
        await page.goto('/admin-login');
        await page.fill('#username', 'admin');
        await page.fill('#password', 'admin123');
        await page.click('#loginBtn');
        // Should redirect to admin panel
        await page.waitForURL('**/admin', { timeout: 10_000 });
        await expect(page).toHaveURL(/\/admin$/);
    });

    test('should show dashboard after login', async ({ page }) => {
        await adminLogin(page);
        await goToAdmin(page);
        // Dashboard is active by default
        await expect(page.locator('#dashboard-section')).toHaveClass(/active/);
        await expect(page.locator('#gameState')).toBeVisible();
    });

    test('should navigate between sections', async ({ page }) => {
        await adminLogin(page);
        await goToAdmin(page);

        // Navigate to Questions
        await navigateToSection(page, 'questions');
        await expect(page.locator('#questions-section')).toHaveClass(/active/);

        // Navigate to Director
        await navigateToSection(page, 'director');
        await expect(page.locator('#director-section')).toHaveClass(/active/);

        // Navigate to Activity
        await navigateToSection(page, 'activity');
        await expect(page.locator('#activity-section')).toHaveClass(/active/);

        // Back to Dashboard
        await navigateToSection(page, 'dashboard');
        await expect(page.locator('#dashboard-section')).toHaveClass(/active/);
    });

    test('should display dashboard activity mini-feed', async ({ page }) => {
        await adminLogin(page);
        await goToAdmin(page);
        // The mini feed should exist in dashboard
        await expect(page.locator('#dashboardActivityFeed')).toBeVisible();
    });
});
