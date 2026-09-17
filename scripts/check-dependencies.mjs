import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';

// In a hook, validate the index, not unstaged corrections in the working tree.
const staged = process.argv.includes('--staged');
const read = (path) => staged
  ? execFileSync('git', ['show', `:${path}`], { encoding: 'utf8' })
  : readFileSync(path, 'utf8');
try {
  const root = JSON.parse(read('package.json'));
  const workspace = parse(read('pnpm-workspace.yaml'));
  const lock = parse(read('pnpm-lock.yaml'));
  if (root.packageManager !== 'pnpm@8.15.4' || String(lock.lockfileVersion) !== '6.0') {
    throw new Error('pnpm version/lock format changed: migrate and review the guard and CI together.');
  }
  for (const [name, value] of Object.entries({ workspace: workspace.overrides, lock: lock.overrides })) {
    if (!isDeepStrictEqual(root.pnpm?.overrides ?? {}, value ?? {})) throw new Error(`${name} overrides do not match package.json`);
  }
  const patches = root.pnpm?.patchedDependencies ?? {};
  const lockedPatches = Object.fromEntries(Object.entries(lock.patchedDependencies ?? {}).map(([name, value]) => [name, value.path]));
  if (!isDeepStrictEqual(patches, workspace.patchedDependencies ?? {}) || !isDeepStrictEqual(patches, lockedPatches)) {
    throw new Error('Patched dependency declarations differ between package.json, workspace and lockfile.');
  }
  for (const path of Object.values(patches)) if (!read(path).trim()) throw new Error(`Missing or empty dependency patch: ${path}`);
  const files = staged
    ? execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
    : ['package.json', ...['apps', 'packages'].flatMap(dir => readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => `${dir}/${e.name}/package.json`))];
  const manifests = files.filter(p => /^(package\.json|(apps|packages)\/[^/]+\/package\.json)$/.test(p));
  const importers = new Set();
  for (const file of manifests) {
    const manifest = JSON.parse(read(file));
    const key = file === 'package.json' ? '.' : file.slice(0, -'/package.json'.length);
    importers.add(key);
    const importer = lock.importers?.[key];
    if (!importer) throw new Error(`Missing lock importer: ${key}`);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const peers = section === 'dependencies' && lock.settings?.autoInstallPeers
        ? Object.fromEntries(Object.entries(manifest.peerDependencies ?? {}).filter(([name]) => !manifest.devDependencies?.[name] && !manifest.optionalDependencies?.[name])) : {};
      const declared = Object.fromEntries(Object.entries({ ...peers, ...manifest[section] }).map(([name, specifier]) => [name, root.pnpm?.overrides?.[name] ?? specifier]));
      const locked = Object.fromEntries(Object.entries(importer[section] ?? {}).map(([name, data]) => [name, data.specifier]));
      if (!isDeepStrictEqual(declared, locked)) throw new Error(`${file}: ${section} differ from lockfile; run pnpm install and stage both changes.`);
    }
  }
  for (const key of Object.keys(lock.importers ?? {})) if (!importers.has(key)) throw new Error(`Orphan lock importer: ${key}`);
  console.log(`Dependency guard passed (${staged ? 'staged' : 'working tree'}, ${manifests.length} manifests).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
