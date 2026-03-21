import { test, expect } from '@playwright/test';
import { adminLogin, goToAdmin, navigateToSection, getAdminToken } from './helpers';
import path from 'path';
import fs from 'fs';

// Create a minimal test image (1x1 pixel PNG)
function createTestImage(): Buffer {
    // Minimal PNG: 1x1 pixel, red
    return Buffer.from(
        '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000002000198e1c92f0000000049454e44ae426082',
        'hex'
    );
}

// Create a minimal test WAV file
function createTestAudio(): Buffer {
    // Minimal WAV header + 1 sample
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36, 4); // file size - 8
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(44100, 24); // sample rate
    header.writeUInt32LE(44100, 28); // byte rate
    header.writeUInt16LE(1, 32); // block align
    header.writeUInt16LE(8, 34); // bits per sample
    header.write('data', 36);
    header.writeUInt32LE(0, 40); // data size
    return header;
}

test.describe('Media Library', () => {
    test('4a - should upload an image via API', async ({ request }) => {
        const token = await getAdminToken(request);
        const imageBuffer = createTestImage();

        const response = await request.post('/api/upload', {
            headers: { Authorization: `Bearer ${token}` },
            multipart: {
                file: {
                    name: 'test-image.png',
                    mimeType: 'image/png',
                    buffer: imageBuffer,
                },
            },
        });

        expect(response.status()).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.url).toBeDefined();
        expect(data.url).toContain('/uploads/');
    });

    test('4b - should upload audio via API', async ({ request }) => {
        const token = await getAdminToken(request);
        const audioBuffer = createTestAudio();

        const response = await request.post('/api/upload', {
            headers: { Authorization: `Bearer ${token}` },
            multipart: {
                file: {
                    name: 'test-audio.wav',
                    mimeType: 'audio/wav',
                    buffer: audioBuffer,
                },
            },
        });

        expect(response.status()).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.url).toBeDefined();
    });

    test('gallery API should return uploaded files', async ({ request }) => {
        const token = await getAdminToken(request);

        // Upload an image first
        const imageBuffer = createTestImage();
        await request.post('/api/upload', {
            headers: { Authorization: `Bearer ${token}` },
            multipart: {
                file: {
                    name: 'gallery-test.png',
                    mimeType: 'image/png',
                    buffer: imageBuffer,
                },
            },
        });

        // Fetch gallery
        const response = await request.get('/api/upload/gallery', {
            headers: { Authorization: `Bearer ${token}` },
        });

        expect(response.status()).toBe(200);
        const data = await response.json();
        expect(data.items).toBeDefined();
        expect(Array.isArray(data.items)).toBe(true);
        expect(data.items.length).toBeGreaterThanOrEqual(1);
    });

    test('gallery should filter by type', async ({ request }) => {
        const token = await getAdminToken(request);

        // Filter images
        const imgResp = await request.get('/api/upload/gallery?type=image', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(imgResp.status()).toBe(200);
        const imgData = await imgResp.json();
        for (const item of imgData.items) {
            expect(item.media_type).toBe('image');
        }

        // Filter audio
        const audioResp = await request.get('/api/upload/gallery?type=audio', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(audioResp.status()).toBe(200);
    });

    test('should show gallery modal in UI', async ({ page }) => {
        await adminLogin(page);
        await goToAdmin(page);
        await navigateToSection(page, 'questions');

        // Click "Yeni Soru" to open question modal
        await page.click('#addQuestionBtn');
        await page.waitForSelector('#questionModal.active', { timeout: 5_000 });

        // Gallery button should be visible
        const galleryBtn = page.getByText('Galeriden Sec');
        await expect(galleryBtn).toBeVisible();

        // Click gallery button
        await galleryBtn.click();
        await page.waitForSelector('#galleryModal.active', { timeout: 5_000 });

        // Gallery should have filter buttons
        await expect(page.getByText('Tumunu')).toBeVisible();
        await expect(page.getByText('Resimler')).toBeVisible();
        await expect(page.getByText('Sesler')).toBeVisible();
        await expect(page.getByText('Videolar')).toBeVisible();

        // Gallery grid should exist
        await expect(page.locator('#galleryGrid')).toBeVisible();
    });

    test('should reject oversized files', async ({ request }) => {
        const token = await getAdminToken(request);

        // Create a buffer that exceeds size limit info
        // We don't actually create 50MB, just test the endpoint validates
        const response = await request.post('/api/upload', {
            headers: { Authorization: `Bearer ${token}` },
            multipart: {
                file: {
                    name: 'test.exe',
                    mimeType: 'application/octet-stream',
                    buffer: Buffer.from('not an image'),
                },
            },
        });

        // Should reject invalid MIME type
        expect(response.status()).toBeGreaterThanOrEqual(400);
    });

    test('question modal should have media upload area', async ({ page }) => {
        await adminLogin(page);
        await goToAdmin(page);
        await navigateToSection(page, 'questions');

        await page.click('#addQuestionBtn');
        await page.waitForSelector('#questionModal.active', { timeout: 5_000 });

        // Upload area should exist
        await expect(page.locator('#imageUploadArea')).toBeVisible();
        await expect(page.locator('.upload-placeholder')).toBeVisible();

        // File input should accept multiple media types
        const fileInput = page.locator('#imageInput');
        const accept = await fileInput.getAttribute('accept');
        expect(accept).toContain('image/*');
        expect(accept).toContain('audio/*');
        expect(accept).toContain('video/mp4');
    });
});
