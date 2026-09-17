# Dependency compatibility patches

## image-size 1.2.1 security patch

`image-size@1.2.1.patch` addresses the ICNS and JXL/HEIF non-progress loops
reported as GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq in Metro's dependency.
It validates ICNS file/entry headers and requires each entry to advance by at
least eight bytes without crossing the declared file length. Prefix-buffer
dimension inspection is preserved: an ICNS payload may extend beyond the
supplied prefix, but its header must be present and its length fit the file.

The shared ISO box reader rejects undersized headers and sizes below eight,
including matching boxes (not just skipped boxes). JXL partial codestream
boxes additionally require the four-byte index after the header. Normal
32-bit boxes remain supported. Zero-sized (to-EOF) and extended-size boxes
are explicitly rejected; this patch does not introduce support for them.

Run `node --test scripts/image-size-security.test.mjs`. The tests resolve the
actual package used by Metro, execute malformed input in children with a
three-second timeout, and check valid ICNS/HEIF/JXL headers plus PNG dimensions.

The package version remains 1.2.1, so registry audits still report both
advisories. No audit suppression has been added. Retain this patch and its
tests until an upstream replacement has been reviewed and tested.

## decode-uri-component compatibility

`decode-uri-component@0.5.0.patch` adds a CommonJS entry to upstream 0.5.0
for `query-string@7.1.3`, which calls the decoder with `require()`.
The ESM entry and upstream security fix are unchanged. `index.cjs` is an exact
copy of upstream `index.js` with only the default export replaced by
`module.exports`; the compatibility test verifies this mechanically.

The patch is registered in package.json and pnpm-workspace.yaml, and its hash
is recorded in pnpm-lock.yaml. Commit all four together. pnpm applies it during
installation, including `--ignore-scripts`; no postinstall mutation is needed.

Run `node --test scripts/security-compatibility.test.mjs` to verify both module
formats, query-string behavior, malformed-input termination, ExcelJS conditional
formatting round-trip, and xcode identifier generation. The tests also check that
the actual ExcelJS/xcode resolution uses uuid 11.1.1, not a stale nested package.

When upgrading the decoder, review upstream code and regenerate this patch;
do not reuse it under a different version. Remove it once all callers support
the upstream ESM interface directly.
