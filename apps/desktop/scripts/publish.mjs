// Release publisher wrapper.
//
// electron-builder reads GH_TOKEN ONLY from real environment variables — unlike
// Prisma and Vite, it does NOT auto-load .env. This wrapper loads apps/desktop/.env
// into the environment first, then runs `electron-builder --publish always`, so the
// token can live in .env (which is gitignored) instead of being re-typed every time.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(__dirname, '..');
const envPath = path.join(desktopDir, '.env');

// ── Load .env (only keys not already set in the real environment win) ─────────
if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        // A real shell env var (e.g. $env:GH_TOKEN) takes precedence over .env.
        if (!(key in process.env)) process.env[key] = val;
    }
}

if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error('\n[publish] GH_TOKEN not found.');
    console.error('          Add a line  GH_TOKEN=ghp_xxxxx  to apps/desktop/.env  (gitignored),');
    console.error('          or set it in the shell:  $env:GH_TOKEN="ghp_xxxxx"  before releasing.\n');
    process.exit(1);
}

// stdio inherited so electron-builder's progress/errors stream straight through.
// The child inherits process.env, including the GH_TOKEN we just loaded.
execSync('electron-builder --publish always', { stdio: 'inherit', cwd: desktopDir });
