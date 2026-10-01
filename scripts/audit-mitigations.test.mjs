import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSizePatchSha256, partitionFindings } from './audit-mitigations.mjs';
const finding = { package: 'image-size', url: 'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq', installedVersions: ['1.2.1'] };
const proof = { declared: true, sha256: imageSizePatchSha256, runtimeVerified: true };
test('only verified backports distinguish a registry finding from an exploitable installed parser', () => {
  assert.equal(partitionFindings([finding], proof).mitigated.length, 1);
  for (const evidence of [{ ...proof, declared: false }, { ...proof, sha256: 'changed' }, { ...proof, runtimeVerified: false }]) {
    assert.equal(partitionFindings([finding], evidence).actionable.length, 1);
  }
});
test('new advisories and unpatched or mixed installed versions remain failures', () => {
  for (const change of [{ url: 'https://github.com/advisories/GHSA-new' }, { package: 'other' }, { installedVersions: ['1.2.0'] }, { installedVersions: ['1.2.1', '2.0.2'] }]) {
    assert.equal(partitionFindings([{ ...finding, ...change }], proof).actionable.length, 1);
  }
});
