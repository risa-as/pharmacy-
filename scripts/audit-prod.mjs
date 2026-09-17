import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

// Official npm Bulk Advisory API:
// https://docs.npmjs.com/cli/v11/commands/npm-audit/#bulk-advisory-endpoint
// pnpm v6 marks exclusively development packages dev:true. Shared entries
// have no dev flag and MUST be included. Include optional/platform packages.
const checkedAt = new Date().toISOString();
mkdirSync('artifacts', { recursive: true });
try {
  const source = readFileSync('pnpm-lock.yaml', 'utf8');
  const lock = parse(source);
  if (String(lock.lockfileVersion) !== '6.0' || !lock.packages) throw new Error('Unsupported lock format; audit coverage cannot be established.');
  const packages = {};
  let included = 0, developmentOnly = 0;
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (entry.dev === true) { developmentOnly++; continue; }
    const match = key.match(/^\/((?:@[^/]+\/)?[^@/]+)@([^(/]+)(?:\(.*\))?$/);
    if (!match || !/^\d+\.\d+\.\d+/.test(match[2])) throw new Error(`Cannot audit lock entry: ${key}`);
    const [, name, version] = match;
    (packages[name] ??= new Set()).add(version);
    included++;
  }
  if (!included) throw new Error('Empty production inventory.');
  const inventory = Object.fromEntries(Object.entries(packages).map(([name, versions]) => [name, [...versions].sort()]));
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(inventory), signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Registry HTTP ${response.status}`);
  const advisories = await response.json();
  if (!advisories || Array.isArray(advisories) || typeof advisories !== 'object') throw new Error('Invalid registry response');
  const unique = new Map();
  for (const [name, entries] of Object.entries(advisories)) {
    if (!inventory[name] || !Array.isArray(entries)) throw new Error('Unexpected registry advisory data');
    for (const advisory of entries) {
      if (!advisory.id || !['info', 'low', 'moderate', 'high', 'critical'].includes(advisory.severity)) throw new Error('Invalid advisory');
      unique.set(advisory.url ?? advisory.id, { ...advisory, package: name, installedVersions: inventory[name] });
    }
  }
  const findings = [...unique.values()];
  const summary = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const finding of findings) summary[finding.severity]++;
  const report = { checkedAt, complete: true, source: 'npm Bulk Advisory API', lockSha256: createHash('sha256').update(source).digest('hex'),
    scope: 'All production/shared/optional lock entries; excludes only dev:true. Counts are unique advisories, not dependency paths.',
    included, developmentOnly, inventory, summary, findings };
  writeFileSync('artifacts/audit-prod.json', JSON.stringify(report, null, 2));
  writeFileSync('artifacts/audit-prod-status.json', JSON.stringify({ checkedAt, complete: true, code: findings.length ? 1 : 0 }));
  console.log(JSON.stringify({ included, developmentOnly, summary, findings: findings.map(f => ({ package: f.package, severity: f.severity, title: f.title, url: f.url })) }, null, 2));
  process.exitCode = findings.length ? 1 : 0;
} catch (error) {
  writeFileSync('artifacts/audit-prod.json', JSON.stringify({ checkedAt, complete: false, error: error.message }, null, 2));
  writeFileSync('artifacts/audit-prod-status.json', JSON.stringify({ checkedAt, complete: false, code: 2, error: error.message }));
  console.error(`Audit incomplete: ${error.message}`);
  process.exitCode = 2;
}
