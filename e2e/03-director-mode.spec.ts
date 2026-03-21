import { test, expect, Page, Browser } from '@playwright/test';
import { adminLogin, goToAdmin, navigateToSection } from './helpers';

test.describe('Director Mode', () => {
    test.describe.configure({ mode: 'serial' });

    let adminPage: Page;
    let screenPage: Page;

    test.beforeAll(async ({ browser }) => {
        // Open admin page
        adminPage = await browser.newPage();
        await adminLogin(adminPage);
        await goToAdmin(adminPage);
        await navigateToSection(adminPage, 'director');

        // Open screen page
        screenPage = await browser.newPage();
        await screenPage.goto('http://localhost:3000/screen');
        await screenPage.waitForTimeout(2000);
    });

    test.afterAll(async () => {
        await adminPage?.close();
        await screenPage?.close();
    });

    test('should show director section with scene buttons', async () => {
        await expect(adminPage.locator('#director-section')).toHaveClass(/active/);
        await expect(adminPage.locator('.director-grid')).toBeVisible();
        const buttons = adminPage.locator('.director-btn');
        expect(await buttons.count()).toBe(3);
    });

    test('should show custom text form', async () => {
        await expect(adminPage.locator('#directorText')).toBeVisible();
        await expect(adminPage.locator('#directorSubtitle')).toBeVisible();
    });

    test('should show image form', async () => {
        await expect(adminPage.locator('#directorImageUrl')).toBeVisible();
        await expect(adminPage.locator('#directorImageTitle')).toBeVisible();
    });

    test('2a - should switch screen to idle', async () => {
        await adminPage.click('.director-btn:nth-child(1)');
        await screenPage.waitForTimeout(1500);
        await expect(screenPage.locator('#idleScreen')).toBeVisible({ timeout: 5_000 });
    });

    test('2b - should show leaderboard on screen', async () => {
        await adminPage.click('.director-btn:nth-child(2)');
        await screenPage.waitForTimeout(1500);
        await expect(screenPage.locator('#directorScreen')).toBeVisible({ timeout: 5_000 });
        await expect(screenPage.locator('#directorLeaderboardContainer')).toBeVisible({ timeout: 5_000 });
    });

    test('2c - should show custom text on screen', async () => {
        await adminPage.fill('#directorText', 'Merhaba Dunya');
        await adminPage.fill('#directorSubtitle', 'Test mesaji');

        // Find "Ekranda Goster" button in "Ozel Metin Goster" card
        const textCards = adminPage.locator('#director-section .card');
        const textCard = textCards.nth(1); // second card = custom text
        await textCard.locator('.btn-primary').click();

        await screenPage.waitForTimeout(1500);
        await expect(screenPage.locator('#directorScreen')).toBeVisible({ timeout: 5_000 });
        await expect(screenPage.locator('#directorTextContainer')).toBeVisible({ timeout: 5_000 });
        await expect(screenPage.locator('#directorMainText')).toHaveText('Merhaba Dunya');
        await expect(screenPage.locator('#directorSubtitleText')).toHaveText('Test mesaji');
    });

    test('2d - should show image on screen', async () => {
        await adminPage.fill('#directorImageUrl', '/uploads/question-1767179844143-81412617.webp');
        await adminPage.fill('#directorImageTitle', 'Test Baslik');

        // Find "Ekranda Goster" button in image card
        const cards = adminPage.locator('#director-section .card');
        const imgCard = cards.nth(2); // third card = image
        await imgCard.locator('.btn-primary').click();

        await screenPage.waitForTimeout(1500);
        await expect(screenPage.locator('#directorScreen')).toBeVisible({ timeout: 5_000 });
        await expect(screenPage.locator('#directorImageContainer')).toBeVisible({ timeout: 5_000 });
    });

    test('2e - should show podium on screen', async () => {
        await adminPage.click('.director-btn:nth-child(3)');
        await screenPage.waitForTimeout(1500);
        await expect(screenPage.locator('#podiumScreen')).toBeVisible({ timeout: 5_000 });
    });

    test('should return to idle after custom scene', async () => {
        // Show custom text first
        await adminPage.fill('#directorText', 'Gecici');
        const textCards = adminPage.locator('#director-section .card');
        await textCards.nth(1).locator('.btn-primary').click();
        await screenPage.waitForTimeout(1000);

        // Then go back to idle
        await adminPage.click('.director-btn:nth-child(1)');
        await screenPage.waitForTimeout(1500);
        await expect(screenPage.locator('#idleScreen')).toBeVisible({ timeout: 5_000 });
    });
});
