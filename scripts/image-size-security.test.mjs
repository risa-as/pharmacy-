import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const metroRequire = createRequire(require.resolve('metro'));
const entry = metroRequire.resolve('image-size');
const types = join(dirname(entry), 'types');
const { ICNS } = require(join(types, 'icns.js'));
const { HEIF } = require(join(types, 'heif.js'));
const { JXL } = require(join(types, 'jxl.js'));
const { findBox } = require(join(types, 'utils.js'));
function box(name, payload = Buffer.alloc(0), size = 8 + payload.length) {
  const b = Buffer.alloc(8 + payload.length); b.writeUInt32BE(size); b.write(name, 4, 4, 'ascii'); payload.copy(b, 8); return b;
}
function icns(entries) { const payload = Buffer.concat(entries); const b = Buffer.alloc(8); b.write('icns'); b.writeUInt32BE(8 + payload.length, 4); return Buffer.concat([b, payload]); }
function icon(name, size = 8) { const b = Buffer.alloc(8); b.write(name); b.writeUInt32BE(size, 4); return b; }
function boundedReject(format, buffer) {
  const child = spawnSync(process.execPath, ['-e', `const parser=require(${JSON.stringify(join(types, format.toLowerCase()+'.js'))})[${JSON.stringify(format)}];try{parser.calculate(Buffer.from(process.argv[1],'base64'));process.exit(2)}catch(e){if(!(e instanceof TypeError || e instanceof RangeError || e instanceof Error))process.exit(3)}`, buffer.toString('base64')], { timeout: 3000, encoding: 'utf8' });
  assert.equal(child.error, undefined, `Parser timed out: ${child.error}`);
  assert.equal(child.status, 0, child.stderr);
}
test('ICNS valid single/multiple icons retain dimensions', () => {
  assert.equal(ICNS.calculate(icns([icon('icp4')])).width, 16);
  const result = ICNS.calculate(icns([icon('icp4'), icon('icp5')]));
  assert.deepEqual(result.images.map(i => i.width), [16, 32]);
});
test('ICNS zero, undersized, oversized and truncated entry headers terminate', () => {
  for (const size of [0, 1, 7, 1000]) boundedReject('ICNS', icns([icon('icp4'), icon('icp5', size)]));
  boundedReject('ICNS', icns([icon('icp4'), Buffer.from('abc')]));
});
test('matching JXL partial boxes cannot return zero progress', () => {
  for (const size of [0, 1, 7, 8, 11]) boundedReject('JXL', box('jxlp', Buffer.alloc(4), size));
});
test('HEIF malformed box sizes terminate', () => {
  for (const size of [0, 1, 7]) boundedReject('HEIF', box('free', Buffer.alloc(0), size));
  boundedReject('HEIF', Buffer.from([0, 0, 0, 8]));
});
test('ordinary boxes remain searchable; truncated payload is not returned', () => {
  const b = Buffer.concat([box('free'), box('ispe')]);
  assert.deepEqual(findBox(b, 'ispe', 0), { name: 'ispe', offset: 8, size: 8 });
  assert.equal(findBox(box('ispe', Buffer.alloc(0), 1000), 'ispe', 0), undefined);
});
test('valid HEIF nested dimensions remain readable', () => {
  const dimensions = Buffer.alloc(12); dimensions.writeUInt32BE(640, 4); dimensions.writeUInt32BE(480, 8);
  const ftyp = box('ftyp', Buffer.from('heic0000'));
  const meta = box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', box('ispe', dimensions)))]));
  const input = Buffer.concat([ftyp, meta]);
  assert.equal(HEIF.validate(input), true);
  assert.equal(HEIF.calculate(input).width, 640);
  assert.equal(HEIF.calculate(input).height, 480);
});
test('valid JXL codestream containers retain dimensions', () => {
  const stream = Buffer.from([0xff, 0x0a, 0x01, 0x00]);
  const { JXLStream } = require(join(types, 'jxl-stream.js'));
  const expected = JXLStream.calculate(stream);
  assert.deepEqual(JXL.calculate(box('jxlc', stream)), expected);
  assert.deepEqual(JXL.calculate(box('jxlp', Buffer.concat([Buffer.alloc(4), stream]))), expected);
});
test('Metro public API still reads a regular PNG', () => {
  const b = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489','hex');
  const size = metroRequire('image-size').imageSize(b);
  assert.equal(size.width, 1); assert.equal(size.height, 1);
});
