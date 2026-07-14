// Pre-build cleanup — fixes the recurring Windows error:
//   "remove ...\win-unpacked\resources\app.asar:
//    The process cannot access the file because it is being used by another process."
//
// Two things caused this:
//  1. A still-running instance of the previously built app holds a lock on app.asar.
//     → we taskkill it below.
//  2. VS Code's file watcher locks app.asar when the build output lives INSIDE the
//     open workspace. `files.watcherExclude` did NOT reliably release that lock.
//     → the real fix is in package.json: directories.output now points OUTSIDE the
//       workspace (a sibling folder next to the repo), so VS Code never watches it.
//
// This script just clears the (now external) output dir before electron-builder runs.

import { rmSync, existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(__dirname, '..');

// Read the real output dir from package.json so this stays in sync if it ever moves.
// electron-builder resolves directories.output relative to the app dir (desktopDir).
const pkg = JSON.parse(readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
const productName = pkg.build?.productName || pkg.name;
const outputRel = pkg.build?.directories?.output || 'release';
const releaseDir = path.resolve(desktopDir, outputRel);

if (process.platform === 'win32') {
    // Close anything that can hold a handle on win-unpacked\resources\app.asar:
    //  - the built app itself (named after productName)
    //  - a leftover electron-builder native helper
    const targets = [`${productName}.exe`, 'app-builder.exe'];
    for (const name of targets) {
        try {
            execSync(`taskkill /F /IM "${name}" /T`, { stdio: 'ignore' });
            console.log(`[clean] Closed running process: ${name}`);
        } catch {
            // Process wasn't running — nothing to do.
        }
    }
}

if (existsSync(releaseDir)) {
    console.log(`[clean] Removing output directory: ${releaseDir}`);
    try {
        // maxRetries/retryDelay let Node retry on EBUSY/EPERM while a handle is
        // released (common with antivirus scanning freshly-written files on Windows).
        rmSync(releaseDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        console.log('[clean] Output directory removed.');
    } catch (err) {
        console.error('\n[clean] Could not delete the build output directory — a file is locked.');
        console.error(`        ${err.message}\n`);
        console.error('  Close any running instance of the app, then re-run the build.');
        console.error(`  Locked path: ${releaseDir}\n`);
        process.exit(1);
    }
} else {
    console.log('[clean] No output directory to remove.');
}
