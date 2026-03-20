/**
 * Frontend Build Pipeline - esbuild
 *
 * Two build modes:
 * - ES Module bundles: Entry points in public/js/src/ with import/export (player)
 * - Concat bundles: Legacy files concatenated + minified (admin, jury, screen)
 *
 * Output goes to public/dist/.
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const JS_DIR = path.join(PUBLIC_DIR, 'js');
const SRC_DIR = path.join(JS_DIR, 'src');
const DIST_DIR = path.join(PUBLIC_DIR, 'dist');

// ES Module entry points (proper import/export bundling)
const moduleEntries = [
    { entry: 'src/player.entry.js', outfile: 'player.bundle.js' },
];

// Legacy concat bundles (concatenate + minify)
const concatBundles = [
    ['admin.bundle.js', 'common.js', 'admin.js'],
    ['jury.bundle.js', 'common.js', 'jury.js'],
    ['screen.bundle.js', 'common.js', 'sounds.js', 'screen.js'],
];

// Vendor files (already minified, just copy)
const vendorFiles = ['socket.io.min.js'];

function formatSize(bytes) {
    return (bytes / 1024).toFixed(1) + 'KB';
}

async function build() {
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Copy vendor files
    for (const file of vendorFiles) {
        fs.copyFileSync(path.join(JS_DIR, file), path.join(DIST_DIR, file));
        console.log(`  Copied: ${file}`);
    }

    // Build ES module bundles
    for (const { entry, outfile } of moduleEntries) {
        const entryPath = path.join(JS_DIR, entry);
        const outPath = path.join(DIST_DIR, outfile);

        await esbuild.build({
            entryPoints: [entryPath],
            outfile: outPath,
            bundle: true,
            minify: true,
            sourcemap: true,
            target: 'es2020',
            format: 'iife',
            external: ['socket.io-client'],
        });

        const originalSize = fs.statSync(entryPath).size;
        const minifiedSize = fs.statSync(outPath).size;
        console.log(`  Built (module): ${outfile} (${formatSize(originalSize)} → ${formatSize(minifiedSize)})`);
    }

    // Build legacy concat bundles
    for (const [outputName, ...sources] of concatBundles) {
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
        console.log(`  Built (concat): ${outputName} (${formatSize(originalSize)} → ${formatSize(minifiedSize)}, -${savings}%)`);
    }

    console.log('\nFrontend build complete!');
}

build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
