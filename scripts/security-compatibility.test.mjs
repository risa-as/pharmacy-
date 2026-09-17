import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
test('patched CommonJS decoder contains the exact upstream fixed algorithm', async () => {
  const cjsPath = require.resolve('decode-uri-component');
  assert.equal(cjsPath.endsWith('index.cjs'), true);
  const source = readFileSync(join(dirname(cjsPath), 'index.js'), 'utf8').replace(/\r\n/g, '\n').trim();
  const cjs = readFileSync(cjsPath, 'utf8').replace(/\r\n/g, '\n').trim();
  assert.equal(cjs, source.replace('export default function decodeUriComponent(encodedURI) {', 'module.exports = function decodeUriComponent(encodedURI) {'));
  const decode = require('decode-uri-component');
  const { default: esmDecode } = await import('decode-uri-component');
  for (const text of ['%D8%B5%D9%8A%D8%AF%D9%84%D9%8A%D8%A9', '%F0%9F%92%8A', '%', '%C2', '%FE%FF', '%41%FF%42', 'a+b', '%GG']) {
    assert.equal(decode(text), esmDecode(text));
  }
});
test('query-string retains Arabic, arrays and plus-sign parsing', () => {
  const qs = require('query-string');
  const parsed = qs.parse('name=%D8%AF%D9%88%D8%A7%D8%A1&search=a+b&ids=1&ids=2&literal=%2B');
  assert.equal(parsed.name, 'دواء');
  assert.equal(parsed.search, 'a b');
  assert.equal(parsed.literal, '+');
  assert.deepEqual(parsed.ids, ['1', '2']);
  assert.equal(qs.parse(qs.stringify({ name: 'دواء', search: 'a+b' })).search, 'a+b');
});
test('malformed percent input completes within a bounded child process', () => {
  const code = `const qs=require('query-string');const value='%FF'.repeat(3000);if(qs.parse('q='+value).q!==value)process.exit(1)`;
  const result = spawnSync(process.execPath, ['-e', code], { cwd: process.cwd(), timeout: 5000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
test('ExcelJS uses patched uuid and round-trips conditional formatting', async () => {
  const excelRequire = createRequire(require.resolve('exceljs'));
  assert.equal(excelRequire('uuid/package.json').version, '11.1.1');
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الأدوية');
  sheet.addRows([['دواء', 10], ['ثانٍ', 20]]);
  sheet.addConditionalFormatting({ ref: 'B1:B2', rules: [{ type: 'iconSet', iconSet: '3Stars', cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }] }] });
  const buffer = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  assert.equal(loaded.worksheets[0].getCell('A1').value, 'دواء');
  assert.equal(loaded.worksheets[0].getCell('B2').value, 20);
  assert.equal(loaded.worksheets[0].conditionalFormattings[0].rules[0].iconSet, '3Stars');
});
test('xcode keeps generating valid unique project identifiers with patched uuid', () => {
  const xcodeRequire = createRequire(require.resolve('xcode'));
  assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1');
  const project = require('xcode').project('unused-test-project.pbxproj');
  project.allUuids = () => [];
  const ids = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(ids).size, 100);
  ids.forEach(id => assert.match(id, /^[0-9A-F]{24}$/));
});
