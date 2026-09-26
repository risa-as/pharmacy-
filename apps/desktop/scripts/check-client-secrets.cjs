// Release gate: never print secret values, including when rejecting a build.
const fs = require('node:fs');
const path = require('node:path');
function checkClientSecrets(root) {
  const roots = ['dist', 'dist-electron'];
  const forbidden = /ZAINCASH_SECRET|BACKUP_SECRET_KEY|GH_TOKEN|generateZainCashToken/;
  const failures = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:js|cjs|mjs|json|map|html)$/.test(file) && forbidden.test(fs.readFileSync(file, 'utf8'))) {
        failures.push(path.relative(root, file));
      }
    }
  };
  for (const dir of roots) visit(path.join(root, dir));
  if (failures.length) throw Error('Client secret reference in: ' + failures.join(', '));
}
module.exports = { checkClientSecrets };
if (require.main === module) {
  checkClientSecrets(path.resolve(__dirname, '..'));
  console.log('Client secret reference gate passed. This is not a general secret scan.');
}
