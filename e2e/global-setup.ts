import { request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const AUTH_FILE = path.join(__dirname, '.auth-state.json');

async function globalSetup() {
    const ctx = await request.newContext({ baseURL: BASE });

    const response = await ctx.post('/api/auth/login/admin', {
        data: { username: 'admin', password: 'admin123' },
    });
    const data = await response.json();
    if (!data.success) {
        throw new Error('Global setup: admin login failed — ' + JSON.stringify(data));
    }

    fs.writeFileSync(
        AUTH_FILE,
        JSON.stringify({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            user: data.user,
        }),
    );

    await ctx.dispose();
}

export default globalSetup;
