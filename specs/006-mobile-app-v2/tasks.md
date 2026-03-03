# Tasks: Epic 006 — Mobile App Excellence

**Spec**: `specs/006-mobile-app-v2.md`
**Total tasks**: 51 across 6 phases
**No tests requested** — implementation tasks only

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no intra-phase dependencies)
- **[Story]**: Which user story this task belongs to (A1–A3, B1–B4, C1–C4, D1–D3)
- Story labels omitted in Phase 0 (foundational — blocks all stories)

## User Story Index

| Label | Story | Pillar |
|-------|-------|--------|
| [US-A1] | Every screen respects dark/light mode via ThemeContext + colors.ts tokens | A — UI/UX |
| [US-A2] | Consistent component primitives (Card, Button, Badge, Input, EmptyState) | A — UI/UX |
| [US-A3] | Arabic-first RTL layout with smooth animations | A — UI/UX |
| [US-B1] | Manager dashboard — revenue KPIs, branch selector, low-stock warnings | B — Roles |
| [US-B2] | Manager financial/inventory reports filtered by branch and date range | B — Roles |
| [US-B3] | Pharmacist ergonomic POS — scanner-first, drug interaction warning, receipt print | B — Roles |
| [US-B4] | Pharmacist fast inventory lookup by name or barcode | B — Roles |
| [US-C1] | Push notification when stock drops below reorder threshold | C — Push |
| [US-C2] | Push notification when batch is within 30 days of expiry | C — Push |
| [US-C3] | Manager push notification for new/received purchase orders | C — Push |
| [US-C4] | In-app notification history with unread badge + deep-link on tap | C — Push |
| [US-D1] | Mobile reflects web changes within 30 seconds without manual refresh | D — Sync |
| [US-D2] | Optimistic POS updates — cart appears instantly, sync is background | D — Sync |
| [US-D3] | Sync status indicator in header (dot + last-synced timestamp) | D — Sync |

---

## Phase 0: Foundation (Prerequisite for All Phases)

**Purpose**: Auth context, base UI primitives, and navigation theme migration — must be complete before any user-story work begins.

**⚠️ CRITICAL**: No pillar work can begin until this phase is complete.

- [X] T001 Create `apps/mobile/context/AuthContext.tsx` with `AuthProvider` and `useAuth()` hook exposing `{ user, role, isAdmin, isPharmacist, branchId }`, consuming `authService.getCurrentUser()` on mount
- [X] T002 Wrap root `apps/mobile/app/_layout.tsx` with `<AuthProvider>` so all screens can call `useAuth()` without separate auth service imports
- [X] T003 [P] Create base UI component `apps/mobile/components/ui/Card.tsx` — themed card using NativeWind `className="bg-card border border-border rounded-2xl"`, no hardcoded hex
- [X] T004 [P] Create base UI component `apps/mobile/components/ui/Button.tsx` — primary/secondary/ghost variants with loading state and disabled state, fully NativeWind
- [X] T005 [P] Create base UI component `apps/mobile/components/ui/Badge.tsx` — colored badge for status indicators (success/warning/danger/info variants), NativeWind
- [X] T006 [P] Create base UI component `apps/mobile/components/ui/Input.tsx` — text input with label prop, error state, focus ring using `constants/colors.ts` tokens, NativeWind
- [X] T007 [P] Create base UI component `apps/mobile/components/ui/EmptyState.tsx` — icon + title + subtitle + optional action button, NativeWind
- [X] T008 [P] Create base UI component `apps/mobile/components/ui/Skeleton.tsx` — animated placeholder using `Animated.Value` for opacity pulse, NativeWind
- [X] T009 Migrate `apps/mobile/app/(tabs)/_layout.tsx` header: replace all `StyleSheet.create` hardcoded hex values with `constants/colors.ts` tokens (`LightColors`/`DarkColors`) referenced via `useTheme()`; tab bar background, border, and icon colors must all use token values
- [X] T010 Update `apps/mobile/app/_layout.tsx` Stack navigator: replace hardcoded hex strings for `headerStyle.backgroundColor` and `headerTintColor` with `constants/colors.ts` token values via `useTheme()`

**Checkpoint**: Foundation ready — all UI primitives exist, auth context is wired, navigation uses design tokens. Pillar work can now proceed.

---

## Phase 1: Admin Role — US-B1 & US-B2 (Pillar B)

**Goal**: Manager/Admin role gets a dedicated dashboard and detailed financial reports instead of the current placeholder screen.

**Independent Test**: Log in as ADMIN role → home tab shows revenue KPI cards and branch selector; reports tab shows segmented daily/weekly/monthly breakdown with correct figures from API.

- [X] T011 [US-B1] Redesign `apps/mobile/app/(tabs)/index.tsx` to render role-split layout: when `isAdmin` (from `useAuth()`), render `<AdminDashboard>`; when `isPharmacist`, render `<PharmacistDashboard>`; both components imported from `apps/mobile/components/dashboards/`
- [X] T012 [P] [US-B1] Create `apps/mobile/components/dashboards/AdminDashboard.tsx`: KPI cards (today's revenue, sales count, active debts, alerts count) fetched from `/api/stats`, recent sales list, branch selector dropdown using `<Card>` from T003
- [X] T013 [P] [US-B1] Redesign `apps/mobile/app/(tabs)/reports.tsx` (Manager-only tab): segmented control for Daily/Weekly/Monthly, display revenue/cost/profit/transaction count using `<Card>` from T003, fetch from `/api/reports/sales`
- [X] T014 [P] [US-B2] Create `apps/mobile/app/reports/financial.tsx` deep-dive screen: expense breakdown list, profit margin display, branch comparison section; link to this screen via a "View Full Report" button in the reports tab
- [X] T015 [P] [US-B2] Redesign `apps/mobile/app/(tabs)/smart-orders.tsx` (Manager-only): smart order recommendation cards showing item name, current stock, suggested qty, supplier; "Approve Order" quick-action button per card using `<Card>` and `<Badge>` from Phase 0
- [X] T016 [P] [US-B2] Redesign `apps/mobile/app/(tabs)/purchases.tsx` (Manager-only): purchase order list with status `<Badge>` (Pending/Received/Cancelled); "Receive" action button per row navigates to existing `apps/mobile/app/purchases/[id]/receive.tsx`
- [X] T017 [P] [US-B2] Update `apps/mobile/app/accounting/expenses.tsx` to use `<Card>` and `<Badge>` from Phase 0 instead of raw `View` with hardcoded styles; add expense category filter UI at top of screen

**Checkpoint**: Admin/Manager role fully functional — dashboard + reports independently testable.

---

## Phase 2: Pharmacist Role — US-B3 & US-B4 (Pillar B)

**Goal**: Pharmacist role gets an ergonomic POS starting with the barcode scanner, an enhanced payment flow, and a split inventory view.

**Independent Test**: Log in as PHARMACIST role → home tab shows shift summary + quick actions; sales tab opens with scanner; complete a sale through payment → receipt confirmation; inventory tab shows All/Low Stock/Expiring split with badge-colored stock levels.

- [X] T018 [P] [US-B3] Create `apps/mobile/components/dashboards/PharmacistDashboard.tsx`: shift summary `<Card>` (today's sales count, amount collected), quick action buttons row (New Sale, Scan Barcode, Search Drug, View Debts), recent alerts preview list
- [X] T019 [US-B3] Redesign `apps/mobile/app/(tabs)/sales.tsx` POS screen: initial state shows barcode scanner (via existing `expo-camera`) full-width, search bar below it, cart panel occupying lower 40% of screen, quick-add row for recently sold items; show drug interaction banner from `/api/pos/alerts` before confirming checkout
- [X] T020 [US-B3] Create `apps/mobile/app/checkout/payment.tsx` payment flow screen: payment method selector (Cash/Card/ZainCash/Debit), amount display, change calculator for cash, confirm button that calls existing printer service to print receipt
- [X] T021 [P] [US-B4] Redesign `apps/mobile/app/(tabs)/debts.tsx` Pharmacist view: patient `<Card>` list with outstanding balance `<Badge>` pill, "Pay Now" button that expands an inline payment form; uses `<Card>` and `<Badge>` from Phase 0
- [X] T022 [P] [US-B4] Redesign `apps/mobile/app/(tabs)/inventory.tsx`: top-level tab control (All / Low Stock / Expiring); each drug `<Card>` shows stock level `<Badge>` (green ≥ reorder / yellow near / red below), days-to-expiry chip; search bar pinned at top of screen
- [X] T023 [P] [US-B4] Create `apps/mobile/app/scan.tsx` enhanced barcode scan result screen: drug detail `<Card>` with name, current stock, and price; two side-by-side action buttons — "Add to Cart" and "Add to Patient"

**Checkpoint**: Pharmacist role fully functional — POS, inventory, debts independently testable with no admin dependency.

---

## Phase 3: Push Notifications — US-C1, US-C2, US-C3, US-C4 (Pillar C)

**Goal**: Real push notifications fire on low-stock, expiry, and new purchase events; in-app notification center shows history with unread count badge.

**Independent Test**: Trigger a low-stock update via web API → mobile receives push notification within ~30s; open app → alerts tab shows unread badge count; tap notification → notification marked as read; update badge count decrements.

### Phase 3a — Mobile Client Setup

- [X] T024 Add `expo-notifications` to `apps/mobile/package.json` by running `pnpm add expo-notifications --filter mobile`
- [X] T025 [P] Configure `apps/mobile/app.json` — add to `expo.plugins`: `["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#0F7575" }]` and required `android.permissions` / iOS `infoPlist` entries for push notifications
- [X] T026 Create `apps/mobile/services/notifications.ts` with four exported functions: `requestPermission()`, `registerPushToken()` (calls `PUT /api/notifications/push`), `scheduleLocalNotification(title, body)`, and `addNotificationListener(handler)`
- [X] T027 Update `apps/mobile/app/_layout.tsx` root to call `notifications.requestPermission()` then `notifications.registerPushToken()` after successful login; store the resulting token in AuthContext user state

### Phase 3b — Server Schema & Infrastructure

- [X] T028 [P] Add `NotificationType` enum (`LOW_STOCK`, `EXPIRY`, `NEW_PURCHASE`, `SYSTEM`) and `Notification` model to `apps/web/prisma/schema.prisma` with fields: `id String @id @default(uuid())`, `tenantId String`, `userId String?`, `branchId String?`, `title String`, `body String`, `type NotificationType`, `data Json?`, `isRead Boolean @default(false)`, `readAt DateTime?`, `createdAt DateTime @default(now())`
- [X] T029 Generate Prisma migration for the new model: run `cd apps/web && npx prisma migrate dev --name add_notification_model`

### Phase 3c — Server API & Triggers

- [X] T030 [P] [US-C4] Create web API route `apps/web/app/api/notifications/in-app/route.ts`: GET handler returns unread notifications for the authenticated user (sorted by `createdAt` desc, limit 50); POST handler accepts `{ ids: string[] }` and marks those notification IDs as read (`isRead: true`, `readAt: now()`)
- [X] T031 Create server-side utility `apps/web/app/lib/notifications/notificationTriggers.ts` exporting `sendAndPersistNotification({ type, title, body, targetUserIds, tenantId, branchId? })` — persists a `Notification` row to DB for each target user then calls Expo push API with the token from `User.expoPushToken`
- [X] T032 [P] [US-C1] Wire low-stock trigger in the inventory quantity update handler (locate where inventory `quantity` is written in `apps/web/app/api/inventory/`): after saving, if `quantity ≤ item.reorderLevel`, call `sendAndPersistNotification` with type `LOW_STOCK`
- [X] T033 [P] [US-C2] Wire expiry trigger in the purchase receive endpoint (`apps/web/app/api/purchases/` receive handler): for each received batch where `expiryDate ≤ today + 30 days`, call `sendAndPersistNotification` with type `EXPIRY`
- [X] T034 [P] [US-C3] Wire new-purchase trigger in the purchase order creation route: after creating the order, query all `ADMIN` and `MANAGER` role users in the same `tenantId` and call `sendAndPersistNotification` with type `NEW_PURCHASE`

### Phase 3d — Mobile In-App Notification Center

- [X] T035 [US-C4] Redesign `apps/mobile/app/(tabs)/alerts.tsx` in-app notification center: fetch from `/api/notifications/in-app` using `useEffect`, display notifications in `<Card>` list with `<Badge>` for type; call POST on tap to mark as read; show `<EmptyState>` when list is empty
- [X] T036 [US-C4] Update `apps/mobile/app/(tabs)/_layout.tsx` alerts tab badge: replace current expiry-only count with unread in-app notification count fetched from `/api/notifications/in-app` (count of items where `isRead === false`)

**Checkpoint**: Push notifications end-to-end functional — server triggers → Expo API → device → in-app center, all independently testable.

---

## Phase 4: Two-Way Sync — US-D1, US-D2, US-D3 (Pillar D)

**Goal**: Replace fire-and-forget polling with a managed polling context; add optimistic POS updates; expose sync status in the header.

**Independent Test**: Open inventory tab → wait 2 minutes → update a stock quantity on the web dashboard → mobile refreshes automatically without pull-to-refresh; complete a sale with airplane mode briefly on → sale appears immediately in cart → failure toast appears → retry succeeds when connection restores.

- [X] T037 [US-D3] Create `apps/mobile/context/SyncContext.tsx` with `SyncProvider` component and `useSyncStatus()` hook exposing `{ lastSyncedAt: Record<string, Date>, isSyncing: boolean, triggerSync: (key: string) => void }`
- [X] T038 [P] [US-D1] Create `apps/mobile/services/polling.ts`: polling manager with `register(key: string, fetchFn: () => Promise<void>, intervalMs: number)` and `unregister(key: string)`; pauses polls when `AppState` is `'background'` and resumes on `'active'`
- [X] T039 [US-D3] Update `apps/mobile/app/(tabs)/_layout.tsx` header to render sync status: small colored dot (`green` = synced, `yellow` = syncing, `red` = error) + Arabic label `"آخر تحديث: X دقائق"` computed from `useSyncStatus().lastSyncedAt`
- [X] T040 [US-D1] Register polling jobs in `apps/mobile/app/(tabs)/_layout.tsx` `useEffect` on mount: alerts/notifications every 30 000 ms, inventory low-stock check every 120 000 ms, dashboard stats every 300 000 ms; unregister all on unmount
- [X] T041 [US-D2] Implement optimistic sale creation in `apps/mobile/app/(tabs)/sales.tsx`: on "Confirm Sale" tap — (a) immediately write sale record to local SQLite, (b) show success animation, (c) POST to server in background, (d) on network error show retry toast and mark local sale row as `status: 'pending'`
- [X] T042 [P] [US-D1] Create web API endpoint `apps/web/app/api/sync/notifications/route.ts`: GET accepts `?since=ISO_TIMESTAMP` query param and returns notifications with `createdAt > since`, enabling incremental mobile sync
- [X] T043 [US-D1] Update `apps/mobile/services/sync.ts` to call `SyncContext.triggerSync(key)` before and after each sync operation and report `lastSyncedAt` back to context instead of current fire-and-forget pattern
- [X] T044 [P] [US-D1] Add retry logic to `apps/mobile/services/api.ts`: on network error response, retry the same request up to 3 times with exponential backoff delays of 1 000 ms, 2 000 ms, 4 000 ms before surfacing the error to the caller

**Checkpoint**: Two-way sync fully functional — polling, optimistic writes, and sync status indicator all independently verifiable.

---

## Phase 5: Polish & Quality — US-A1, US-A2, US-A3 (Pillar A)

**Purpose**: Cross-cutting improvements covering dark mode audit, skeleton screens, haptics, RTL animations, and notification deep linking.

- [X] T045 [P] [US-A2] Add `<Skeleton>` loading placeholders (from T008) to all six tabs — replace white-flash blank states on initial data load in inventory, alerts, reports, purchases, debts, and home screens
- [X] T046 [P] [US-A2] Add `RefreshControl` component to all list screens (`inventory`, `debts`, `alerts`, `purchases`) wired to `useSyncStatus().triggerSync(key)` for the appropriate data key
- [X] T047 [P] [US-A2] Add `expo-haptics` feedback calls: `Haptics.notificationAsync(SUCCESS)` on successful sale and payment, `Haptics.selectionAsync()` on tab bar press, `Haptics.notificationAsync(ERROR)` on error states
- [X] T048 [US-A1] Audit every screen under `apps/mobile/app/` for remaining `StyleSheet.create` calls containing hardcoded hex color strings; replace each with the corresponding `constants/colors.ts` token value or an equivalent NativeWind `className`
- [X] T049 [US-A3] Configure RTL screen transition animations in `apps/mobile/app/_layout.tsx` using Reanimated (already installed): set Stack navigator `animation` to `slide_from_right` and override with `slide_from_left` for RTL — so navigation slides right-to-left on forward and left-to-right on back
- [X] T050 [P] [US-C4] Create `apps/mobile/app/settings/notifications.tsx` settings screen: category toggles (Low Stock / Expiry / Purchase Orders), "Send Test Notification" button that calls `notifications.scheduleLocalNotification()`, debug section showing current `expoPushToken`
- [X] T051 [US-C4] Implement deep linking in `apps/mobile/app.json` and `apps/mobile/app/_layout.tsx`: notification tap payload maps `type: LOW_STOCK` → `/inventory`, `type: EXPIRY` → `/inventory`, `type: NEW_PURCHASE` → `/purchases/[orderId]`, `type: SYSTEM` → `/alerts`

**Checkpoint**: All five pillars (including Pillar A) are complete — app is production-ready for initial release.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Foundation)**: No dependencies — start immediately
- **Phase 1 (Admin)**: Blocked by Phase 0 — needs `useAuth()`, `<Card>`, `<Badge>`
- **Phase 2 (Pharmacist)**: Blocked by Phase 0 — needs `useAuth()`, `<Card>`, `<Badge>`, `<EmptyState>`
- **Phase 3 (Push)**: Phase 3a/3b can start after Phase 0; Phase 3c needs Phase 3b (migration); Phase 3d needs Phase 3c (API route)
- **Phase 4 (Sync)**: Blocked by Phase 0 — SyncContext wraps existing services; T041 depends on Phase 2 (sales screen)
- **Phase 5 (Polish)**: Blocked by Phases 0–4 — audits and skeleton screens require all screens to exist

### User Story Dependencies

- **US-B1, US-B2** (Phase 1): Depend only on Phase 0
- **US-B3, US-B4** (Phase 2): Depend only on Phase 0 (independent from Phase 1)
- **US-C1, C2, C3** (Phase 3b–3c): Depend on Phase 3a (install + schema); independent from each other [P]
- **US-C4** (Phase 3d): Depends on Phase 3c (API route T030 exists before T035)
- **US-D1, D2, D3** (Phase 4): D2 (T041) depends on Phase 2 sales screen; D1/D3 depend only on Phase 0
- **US-A1, A2, A3** (Phase 5): All depend on screens existing (Phases 1–4)

### Parallel Opportunities

**Phase 0** — after T001/T002 are done, T003–T008 (six UI components) all run in parallel:
```
T003 Card.tsx  |  T004 Button.tsx  |  T005 Badge.tsx
T006 Input.tsx |  T007 EmptyState.tsx | T008 Skeleton.tsx
```

**Phase 1** — after T011 (role-split index), all admin screens run in parallel:
```
T012 AdminDashboard  |  T013 reports.tsx  |  T014 financial.tsx
T015 smart-orders    |  T016 purchases    |  T017 expenses
```

**Phase 3** — triggers run in parallel after T031 (utility exists):
```
T032 low-stock trigger  |  T033 expiry trigger  |  T034 purchase trigger
```

**Phase 5** — first five polish tasks run in parallel:
```
T045 Skeleton  |  T046 RefreshControl  |  T047 Haptics
T048 StyleSheet audit  |  T049 RTL animations
```

---

## Implementation Strategy

### MVP Scope (Phase 0 + Phase 1)

1. Complete **Phase 0** (Foundation) — 10 tasks
2. Complete **Phase 1** (Admin Dashboard) — 7 tasks
3. **Validate**: ADMIN login → KPI dashboard → reports → financial deep dive
4. Ship or demo this increment

### Incremental Delivery

1. Phase 0 → Foundation ready
2. Phase 1 → Admin/Manager role complete → demo
3. Phase 2 → Pharmacist role complete → demo both roles
4. Phase 3 → Push notifications live → all three business triggers tested
5. Phase 4 → Sync/polling context + optimistic POS → reliability verified
6. Phase 5 → Polish pass → production-ready

### Parallel Team Strategy

With three developers after Phase 0 completes:
- **Dev A**: Phase 1 (Admin UX) — T011–T017
- **Dev B**: Phase 2 (Pharmacist UX) — T018–T023
- **Dev C**: Phase 3a + 3b (Push setup + schema) — T024–T029

---

## Task Summary

| Phase | Tasks | Parallelizable | User Stories |
|-------|-------|----------------|--------------|
| Phase 0 — Foundation | T001–T010 (10) | T003–T008 (6) | Prerequisite |
| Phase 1 — Admin | T011–T017 (7) | T012–T017 (6) | US-B1, US-B2 |
| Phase 2 — Pharmacist | T018–T023 (6) | T018, T021–T023 (4) | US-B3, US-B4 |
| Phase 3 — Push | T024–T036 (13) | T025, T028, T030–T034 (7) | US-C1–C4 |
| Phase 4 — Sync | T037–T044 (8) | T038, T042, T044 (3) | US-D1–D3 |
| Phase 5 — Polish | T045–T051 (7) | T045–T047, T050 (4) | US-A1–A3, US-C4 |
| **Total** | **51 tasks** | **30 parallelizable** | **14 user stories** |

---

## Notes

- [P] tasks operate on different files — safe to run concurrently
- Phase 0 has no user story labels — it is prerequisite infrastructure
- NativeWind v2 already installed — **do NOT upgrade to v4** without a separate migration plan
- All `pnpm` installs must use `--filter mobile` or `--filter web` — no cross-app installs
- Desktop SQLite schema must **not** be modified — `Notification` model lives in web Prisma only
- Commit after each task or logical group; validate each phase checkpoint before proceeding
