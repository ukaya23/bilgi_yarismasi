import { test, expect } from '@playwright/test';
import { adminLogin, goToAdmin, navigateToSection, getAdminToken } from './helpers';

test.describe('Question Import/Export', () => {
    test('3a - should download template xlsx', async ({ request }) => {
        const token = await getAdminToken(request);
        const response = await request.get('/api/questions/template?format=xlsx', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status()).toBe(200);
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('spreadsheet');

        const body = await response.body();
        expect(body.length).toBeGreaterThan(100);
    });

    test('3a - should download template csv', async ({ request }) => {
        const token = await getAdminToken(request);
        const response = await request.get('/api/questions/template?format=csv', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status()).toBe(200);
        const body = await response.text();
        // Should contain header row
        expect(body).toContain('content');
        expect(body).toContain('type');
        expect(body).toContain('options');
    });

    test('3b - should import questions from xlsx', async ({ request }) => {
        const token = await getAdminToken(request);

        // First download template to get proper xlsx format
        const templateResp = await request.get('/api/questions/template?format=xlsx', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const templateBuffer = await templateResp.body();

        // Import the template (it has 2 example rows)
        const response = await request.post('/api/questions/import', {
            headers: { Authorization: `Bearer ${token}` },
            multipart: {
                file: {
                    name: 'test_import.xlsx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    buffer: templateBuffer,
                },
            },
        });

        expect(response.status()).toBe(200);
        const data = await response.json();
        expect(data.total).toBeGreaterThanOrEqual(2);
        expect(data.imported).toBeGreaterThanOrEqual(2);
        expect(data.results).toBeDefined();
        expect(Array.isArray(data.results)).toBe(true);

        // All results should be success
        for (const result of data.results) {
            expect(result.status).toBe('success');
        }
    });

    test('3d - should export questions as xlsx', async ({ request }) => {
        const token = await getAdminToken(request);
        const response = await request.get('/api/questions/export?format=xlsx', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status()).toBe(200);
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('spreadsheet');

        const body = await response.body();
        expect(body.length).toBeGreaterThan(100);
    });

    test('3d - should export questions as csv', async ({ request }) => {
        const token = await getAdminToken(request);
        const response = await request.get('/api/questions/export?format=csv', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status()).toBe(200);
        const body = await response.text();
        // CSV should have content
        expect(body.length).toBeGreaterThan(10);
    });

    test('should show import/export buttons in UI', async ({ page }) => {
        await adminLogin(page);
        await goToAdmin(page);
        await navigateToSection(page, 'questions');

        // Check buttons exist
        await expect(page.getByRole('button', { name: 'Sablon Indir' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Ice Aktar$/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Disa Aktar' })).toBeVisible();
    });

    test('import should reject unauthorized request', async ({ request }) => {
        const response = await request.get('/api/questions/export?format=xlsx');
        // Should be 401 or 403
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });
});
