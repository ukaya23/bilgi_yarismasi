/**
 * Frontend Build Pipeline - esbuild
 *
 * Concatenates and minifies JS files per page.
 * Source files stay in public/js/, bundled output goes to public/dist/.
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const DIST_DIR = path.join(PUBLIC_DIR, 'dist');

// Page bundles: each entry is [outputName, ...sourceFiles]
const bundles = [
    ['admin.bundle.js', 'common.js', 'admin.js'],
    ['player.bundle.js', 'common.js', 'player.js'],
    ['jury.bundle.js', 'common.js', 'jury.js'],
    ['screen.bundle.js', 'common.js', 'sounds.js', 'screen.js'],
];

// socket.io.min.js is already minified, just copy it
const vendorFiles = ['socket.io.min.js'];

async function build() {
    // Ensure dist directory exists
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Copy vendor files
    for (const file of vendorFiles) {
        fs.copyFileSync(
            path.join(JS_DIR, file),
            path.join(DIST_DIR, file)
        );
        console.log(`  Copied: ${file}`);
    }

    // Build each page bundle by concatenating + minifying
    for (const [outputName, ...sources] of bundles) {
        const combined = sources
            .map(src => fs.readFileSync(path.join(JS_DIR, src), 'utf-8'))
            .join('\n;\n');

        const result = await esbuild.transform(combined, {
            minify: true,
            target: 'es2020',
            sourcemap: true,
            sourcefile: outputName,
        });

        fs.writeFileSync(path.join(DIST_DIR, outputName), result.code);
        if (result.map) {
            fs.writeFileSync(path.join(DIST_DIR, `${outputName}.map`), result.map);
        }

        const originalSize = Buffer.byteLength(combined);
        const minifiedSize = Buffer.byteLength(result.code);
        const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
        console.log(`  Built: ${outputName} (${(originalSize / 1024).toFixed(1)}KB → ${(minifiedSize / 1024).toFixed(1)}KB, -${savings}%)`);
    }

    console.log('\nFrontend build complete!');
}

build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
