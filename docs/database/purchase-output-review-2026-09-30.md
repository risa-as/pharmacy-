# Review of supplied monthly stockout result — 2026-09-30

Reviewed the user's pasted result and the release source; no production database access or algorithm changes were made during this review.

- Parsed all 166 displayed stockout rows. Every suggested quantity matches the ceiling of net sales / displayed observed days × 10 for these records. No arithmetic mismatches were found.
- Six rows have a pack count and are eligible for the draft: prolintab, Magic bright لصقات, sinergial tab, juman baking soda soap, Agilox, Appetite booster gummeies. The other 160 explicitly lack confirmed pack units and are excluded from the draft.
- Eight rows have fewer than 30 observed days. The contextual reason incorrectly labels the rate as based on 30 days for every row (`ai-insights.ts` uses `data.days` instead of the row's `observedDays`). The generated narrative repeats that error. prolintab uses 8/10, not 8/30; Kollagen uses 30/26.
- 87 positive rates round to 0.0 in the display. The engine uses the exact rates and is not calculating from those rounded labels.
- Observed days start at the later of the month start and inventory-record creation date. Correct forecasting therefore depends on that date actually representing the start of reliable observation. The supplied text cannot prove this or the accuracy of sales, pack sizes, or current stock.
- Lead time is set to zero, safety days to zero, and coverage starts at arrival. Quantities are forecasts, not a guarantee of ten days of actual demand; unavailable days can suppress recorded demand. Whole-pack rounding may increase the units eventually ordered.

## Previous request: draft creation feedback

Source commit `7e94c28` adds explicit item counts, a spinning indicator/disabled button while registering the draft, and a success icon/status/toast only after browser handoff storage succeeds. Final local production build and browser tests passed, including delayed registration, navigation to review, and a simulated storage failure with retry and no false success. Tests used a synthetic local database, and no warehouse orders were sent.

The user instructed us not to publish. The deployment build created before that instruction (`dpl_4E8w4SaT4BPtGpReoE9EzFgiRM9R`) has NOT been promoted. `app.faramace.com` was verified still pointing to the previous production deployment `dpl_FWNSRnp6mAGUWeJzqSVxemwWGVr7`. No further publishing or promotion was performed. The button change remains pending publication.

Local evidence: ignored artifacts `purchase-output-analysis.json`, `draft-feedback-build.log`, `draft-feedback-browser.log` and screenshots in `artifacts/system-audit-2026-09-30/`.
