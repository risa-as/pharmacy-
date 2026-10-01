# Combined update release — 2026-09-30

User authorization: include all current updates in the previously requested production deployment.

## Release
- Branch: `codex/ai-purchasing-deploy-20260930`
- Runtime changes: `321ed03ab4ab5c975e1485b74c1bae5cfc3944e9` (124 files relative to the prior deployment).
- Final source: `5a5af831c4f0a0b89a43c2f64c8c3f69679dd1c9` (adds corrected historical migration test fixtures only).
- All 143 source-manifest entries matched the development workspace before the test-fixture correction, which was applied to both checkouts. Generated `tsconfig.tsbuildinfo` is excluded.
- Main workspace edits remain intact; no reset, rebase, or generated credentials were committed.

## Validation
- Unit: 1,216 passed (107 files).
- Integration: 370 passed (24 files), including all eight empty-search-path cases.
- Migration fingerprints: 5/5.
- Web and landing production builds passed locally; Vercel builds also READY for final source.
- Windows standalone trace-copy emitted its existing symlink EPERM warning; Linux cloud build succeeded.
- Restored local production copy: applied the function-settings migration, then production HTTP smoke passed for variable coverage 5/10/20, cards, settings, draft creation/import/send/close/retry, and ordinary warehouse orders. Writes were confined to synthetic local fixtures.
- 20 authenticated dashboard pages returned successful responses without detected streamed errors.
- Headless Chromium inspection of prescriptions: light canvas rgb(243,246,249), white cards, border rgb(221,226,233); dark mode retained dark background/cards. Screenshots and computed styles are in ignored audit artifacts.
- Historical migration suite: INCOMPLETE. The local execution session ended before final TAP results were written; its PostgreSQL and test processes were no longer running. Do not count this suite as passed. The legacy fixture was corrected to derive the real historical schema. Independently, the production migration, restored-copy migration/HTTP smoke, 370 integration cases and 5 migration fingerprint tests passed.

## Production database
- Fresh backup: `C:/Users/dell/AppData/Local/FaramaceDeploy/2026-09-30-ai/production-1790780974334.dump`
- SHA-256: `51fc9f13e6ea401f0ee81ae3a977ebef00c69266d45648a7ed38c82eb0cac24e`
- Created: 2026-09-30T15:09:57.746Z; size 6,765,398 bytes.
- Applied only `20260930120000_pin_function_search_path`; Prisma confirmed all 70 migrations up to date.
- No demo seed or synthetic purchase was run in production.

## Deployment targets
- Web production: `dpl_HZcY4opTwKEFwbbXqYRHTCRwKWpm`; previous production `dpl_FEEqnPZyBv7AmfRvTexCbxp8MriP`.
- Landing production: `dpl_JBqYCxNfEAjU5NohCg2bWRQy5hrF`; previous production `dpl_72p4R1hqHTBpoBmq4Xi94kTb5JBf`.
- Promoted both final deployments successfully. Verified app.faramace.com maps to the web deployment, and both faramace.com and www.faramace.com map to the landing deployment.
- Live checks: 13 passed. Login 200; AI status and pack-units APIs reject unauthenticated requests with 401; production CSS includes the new canvas, border and solid-card rules; all 10 brand/screenshot assets return 200 and match local SHA-256 hashes.
- Local web test server stopped; temporary PostgreSQL was confirmed stopped. Local session cookies were removed; backups and audit evidence remain outside source control.

This run does not claim a live model-provider test or a production load benchmark.
