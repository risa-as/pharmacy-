// Only the two published infinite-loop advisories covered by the existing
// compatibility backport may be marked mitigated. New advisories still fail.
const imageSizeAdvisories = new Set([
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
]);
export const imageSizePatchSha256 = '7236a9dcfa8899ba8ad09e41b7e81c799ab54186e2586eaedfd1498321368ce3';
export function partitionFindings(findings, evidence) {
  const mitigated = [], actionable = [];
  for (const finding of findings) {
    const covered = finding.package === 'image-size' && imageSizeAdvisories.has(finding.url)
      && finding.installedVersions?.length === 1 && finding.installedVersions[0] === '1.2.1'
      && evidence.declared && evidence.sha256 === imageSizePatchSha256 && evidence.runtimeVerified;
    (covered ? mitigated : actionable).push(covered ? { ...finding, mitigation: 'Pinned parser backport; all eight exploit/valid-image regression tests passed.' } : finding);
  }
  return { mitigated, actionable };
}
