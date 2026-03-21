import { Page, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const AUTH_FILE = path.join(__dirname, '.auth-state.json');

// In-memory cache (per worker process)
let cachedToken: { accessToken: string; refreshToken: string; user: any } | null = null;

/**
 * Get admin token — reads from file written by globalSetup (shared across workers)
 */
function loadToken(): typeof cachedToken {
    if (cachedToken) return cachedToken;

    if (fs.existsSync(AUTH_FILE)) {
        const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
        cachedToken = data;
        return cachedToken;
    }

    return null;
}

/**
 * Login as admin and navigate to admin panel
 */
export async function adminLogin(page: Page) {
    const tokens = loadToken();
    if (!tokens) throw new Error('Auth state file not found — did globalSetup run?');

    // Navigate to login page first, then set localStorage
    await page.goto(`${BASE}/admin-login`);
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate((t) => {
        localStorage.setItem('adminAccessToken', t.accessToken);
        localStorage.setItem('adminRefreshToken', t.refreshToken);
        localStorage.setItem('adminUsername', t.user.username);
        localStorage.setItem('adminUserId', String(t.user.id));
    }, tokens);

    return tokens;
}

/**
 * Navigate to admin panel (requires prior adminLogin)
 */
export async function goToAdmin(page: Page) {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    // Wait for the dashboard section to be active (= page fully loaded)
    await page.waitForSelector('#dashboard-section.active', { timeout: 15_000 });
}

/**
 * Navigate to a specific section in admin sidebar
 */
export async function navigateToSection(page: Page, section: string) {
    await page.click(`[data-section="${section}"]`);
    await page.waitForSelector(`#${section}-section.active`, { timeout: 5_000 });
}

/**
 * Get admin token string for API calls
 */
export async function getAdminToken(request: APIRequestContext): Promise<string> {
    const tokens = loadToken();
    if (!tokens) throw new Error('Auth state file not found — did globalSetup run?');
    return tokens.accessToken;
}
