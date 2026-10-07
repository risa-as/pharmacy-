# AI chat interface and advertised-question review — 2026-09-30

## Result

The chat has a clearer welcome screen, conversation bubbles, expandable desktop window, responsive mobile layout, and an eight-category example browser. Inventory tools are selected from the composer tools menu. The monthly stockout purchase tool opens an in-conversation setup only after selection; coverage starts blank and accepts 1–365 days, including Arabic/Persian digits. The resulting draft remains subject to review before sending to a warehouse. Inventory tools remain available when the text-answer quota is exhausted.

## Correctness fixes

- Arabic month names followed by a question mark now select that month rather than silently falling back to today.
- This week and last week use Baghdad calendar weeks, Saturday–Friday; last seven days is a separate rolling interval. Context dates are displayed in Baghdad time.
- Sales context includes the total quantity across all sale lines. Sales amounts mean invoice totals after discounts and before returns, explicitly described to the model.
- Patient and supplier debt totals cover every scoped debtor; top-ten lists are separately labelled.
- Pending deliveries use warehouse-order states and an uncapped count, rather than treating unpaid purchase invoices as undelivered orders.
- Current shifts include open shifts started before today and their cash balances.
- Slow-moving stock is classified correctly after Arabic normalization and uses each branch's sales rate, aggregated in PostgreSQL.
- Drug lookups preserve the extracted name and search trade name, scientific name, and exact barcode. Medicine cost questions no longer load an unrelated pharmacy financial report.
- Unnamed individual patient/supplier questions request clarification. Suspicious-activity indicators are explicitly described as review signals, not proof of theft.

## Evidence

- Isolated release checkout: 1,281 unit tests passed (108 files); 377 integration tests passed (25 files).
- Production build and TypeScript validation passed. The final build includes the mobile stacking correction.
- Shared catalogue has 50 advertised questions in eight categories. All 50 have routing assertions; PostgreSQL integration checks load the intended context without generic-dashboard fallback. This verifies data routing, not every possible generated sentence.
- All eight advertised sales questions have exact Baghdad-period assertions and PostgreSQL totals/quantity/invoice checks, including foreign-organization exclusion and literal expected totals.
- Additional real-database checks cover debt totals beyond ten accounts, pending orders beyond twenty, open shifts from yesterday, branch-specific slow movers, scientific-name search, and clarification.
- Actual Gemini `gemini-3-flash-preview` calls answered all eight sales questions correctly on synthetic records: today 150, last week 40, this week's two invoices, April 90, March 110, last month 80, today's five units, last seven days 220. Responses took 2.2–3.8 seconds. These calls were outside the application quota and used no customer records.
- Headless Chrome checks exercise hidden initial coverage, blank initial duration, 10-day and Arabic-20-day commands, invalid durations, all eight example categories, desktop expansion, light/dark presentation, a 360×800 mobile viewport, and purchase availability with exhausted text quota. Chat responses in this UI test are mocked; server-data and real-model evidence are separate. An additional browser check uses the actual local API without a provider: the selected ten-day duration produces a real reorder card and renders successfully, with no order sent.

## Limits

The other 42 example answers were checked for classification and database context, not individually validated against the live model. Model output can vary. Drug searches rely on names recorded in the catalogue; Arabic-to-English aliases are not automatically translated. No matching record must produce an explicit missing-data answer. Named individual patient/supplier drill-down remains outside this change; no aggregate balance should be attributed to one person. No schema migrations are introduced.

Evidence logs and screenshots are local ignored artifacts under `artifacts/system-audit-2026-09-30/` in the main checkout. Deployment identity is recorded separately after the verified commit is built by the hosting provider.
