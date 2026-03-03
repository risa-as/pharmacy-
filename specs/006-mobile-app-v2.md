# Epic 006 — Mobile App Excellence
**Status:** Draft | **Author:** Faramace AI | **Date:** 2026-02-27

> Goal: Transform the Expo mobile app into the #1 pharmacy management app locally — premium
> design, role-optimised UX, real-time alerts, and perfect data consistency with the web dashboard.

---

## 0. Current State Audit

| Area | Status | Debt |
|------|--------|------|
| Theming | Partial — ThemeContext + `constants/colors.ts` exist but `StyleSheet.create` with hardcoded hex values used on most screens | HIGH |
| Role-based nav | Partial — tab visibility toggled via `href:null` but screen contents are identical | MEDIUM |
| Admin dashboard | Basic — single KPI block, no charts, no financial breakdown | HIGH |
| Pharmacist POS | Functional — lacks ergonomic UX, missing quick-action bar | MEDIUM |
| Push notifications | Partial — `expoPushToken` in DB, `/api/notifications/push` endpoint exists; **no triggers wired** | HIGH |
| Two-way sync | Polling only (60s interval for alerts); no reactive updates; no sync-status indicator | HIGH |
| Offline support | SQLite local DB for inventory + sales queue; no dedicated conflict resolution | LOW (works) |

---

## 1. Pillars & User Stories

### Pillar A — Premium UI/UX & Dark Mode

**US-A1** As any pharmacy staff member, I want every screen to respect the system dark/light mode using the existing `ThemeContext` and `constants/colors.ts` design tokens, so that I can use the app comfortably at night or in low-light environments.

**US-A2** As any user, I want consistent component primitives (Card, Button, Badge, Input, EmptyState) so that the app looks and feels cohesive rather than assembled from ad-hoc views.

**US-A3** As any user, I want Arabic-first RTL layout with smooth animations and transitions, so that the app feels native to the Iraqi pharmacy market.

### Pillar B — Role-Based Architecture

**US-B1** As a **Pharmacy Manager (ADMIN/MANAGER)**, I want a dedicated dashboard that shows today's revenue, branch KPIs, top-selling drugs, and low-stock warnings, so that I can make rapid decisions without opening the web dashboard.

**US-B2** As a **Pharmacy Manager**, I want to view detailed financial and inventory reports filtered by branch and date range, so that I have full oversight of pharmacy performance on mobile.

**US-B3** As a **Pharmacist (PHARMACIST)**, I want an ergonomic POS screen that starts with the barcode scanner, shows a drug-interaction warning before completing the sale, and prints a receipt via the thermal printer, so that I can serve patients quickly and safely.

**US-B4** As a **Pharmacist**, I want a fast inventory lookup with stock levels and pricing accessible via name or barcode search, so that I can answer patient queries without leaving the counter.

### Pillar C — Push Notifications

**US-C1** As any staff member, I want to receive a push notification on my phone when inventory stock drops below the reorder threshold, so that I never run out of essential medicines.

**US-C2** As any staff member, I want to receive a push notification when a batch is within 30 days of expiry, so that I can act before financial losses occur.

**US-C3** As a manager, I want to receive a push notification when a new purchase order is created or received, so that I can approve or track deliveries in real time.

**US-C4** As any user, I want to view a notification history inside the app (bell icon with unread badge), so that I don't miss alerts if my phone was offline or in silent mode.

### Pillar D — Two-Way Sync

**US-D1** As any staff member, I want the mobile app to reflect data changes made on the web dashboard within 30 seconds without manual refresh, so that both platforms are always consistent.

**US-D2** As a pharmacist, I want optimistic UI updates — the sale cart shows locally immediately; sync happens in the background — so that the POS never blocks on network latency.

**US-D3** As any user, I want a subtle sync status indicator (last synced timestamp + spinner when active) in the header, so that I know the data I'm viewing is current.

---

## 2. Architecture Decisions

### A. Design System Approach
- **NativeWind v2 (already installed)** — all NEW screens MUST use `className` props, zero new `StyleSheet.create` with hex values
- **Migration path for existing screens:** Replace `StyleSheet` hex values with `constants/colors.ts` tokens first, then class props
- **Base components location:** `apps/mobile/components/ui/` — shared Card, Button, Badge, Input, EmptyState, LoadingSpinner, Skeleton

### B. Role Detection
- Source of truth: `authService.getCurrentUser()` returns `role: 'PHARMACIST' | 'MANAGER' | 'ADMIN'`
- Add `context/AuthContext.tsx` to expose role app-wide via React Context (eliminates repeated `import('../../services/auth')` in every screen)
- Admin view targets: `ADMIN` and `MANAGER` roles
- Pharmacist view targets: `PHARMACIST` (and `CASHIER` if needed in future)

### C. Push Notifications
- **Library:** `expo-notifications` (add to `apps/mobile/package.json`)
- **Token flow:** On first launch after login → request permission → register Expo push token → `PUT /api/notifications/push` to persist token on `User.expoPushToken`
- **Trigger architecture (server-side):** Add a `NotificationLog` Prisma model; wire triggers in web API route handlers for: low-stock (inventory update), expiry (batch creation/update), new purchase order (purchase create)
- **No dedicated WebSocket:** Push triggers are server-initiated via Expo API — no client WebSocket needed for notifications

### D. Sync Architecture
- **Approach:** Intelligent polling with SWR-style stale-while-revalidate
- **Polling intervals:**
  - Critical (alerts, notifications): 30 seconds
  - Inventory: 2 minutes
  - Reports/stats: 5 minutes
- **Optimistic updates:** Sale creation → immediately update local SQLite → show in UI → sync in background
- **Sync context:** `context/SyncContext.tsx` tracks per-resource `lastSyncedAt` and `isSyncing` state
- **WebSocket:** Deferred to Phase 2 (PostMVP). Current polling is sufficient for initial release.
- **Conflict resolution:** Last-write-wins on non-financial data; sales are append-only (no conflict)

### E. DB Changes (Web — Prisma)
- Add `Notification` model with fields: `id`, `tenantId`, `userId?`, `branchId?`, `title`, `body`, `type` (enum), `isRead`, `readAt?`, `createdAt`
- `NotificationType` enum: `LOW_STOCK`, `EXPIRY`, `NEW_PURCHASE`, `SYSTEM`
- No changes to desktop SQLite schema (notifications are cloud-only)

---

## 3. Task List

### Phase 0 — Foundation (Prerequisite for all phases)

- [ ] T0.1 Create `apps/mobile/context/AuthContext.tsx` with `AuthProvider` and `useAuth()` hook exposing `{ user, role, isAdmin, isPharmacist, branchId }`. Consume `authService.getCurrentUser()` on mount.
- [ ] T0.2 Wrap `app/_layout.tsx` root with `<AuthProvider>` so all screens can call `useAuth()` without separate auth imports.
- [ ] T0.3 Create base UI component: `apps/mobile/components/ui/Card.tsx` — themed card with `bg-card border border-border rounded-2xl` using NativeWind className.
- [ ] T0.4 Create base UI component: `apps/mobile/components/ui/Button.tsx` — primary/secondary/ghost variants, loading state, disabled state, fully NativeWind.
- [ ] T0.5 Create base UI component: `apps/mobile/components/ui/Badge.tsx` — colored badge for status indicators (success/warning/danger/info).
- [ ] T0.6 Create base UI component: `apps/mobile/components/ui/Input.tsx` — text input with label, error state, NativeWind, uses `colors.ts` tokens for focus ring.
- [ ] T0.7 Create base UI component: `apps/mobile/components/ui/EmptyState.tsx` — icon + title + subtitle + optional action button.
- [ ] T0.8 Create base UI component: `apps/mobile/components/ui/Skeleton.tsx` — animated placeholder for loading states.
- [ ] T0.9 Migrate `app/(tabs)/_layout.tsx` header: replace `StyleSheet.create` hardcoded colors with `constants/colors.ts` tokens (`LightColors`/`DarkColors`) and `useTheme()`. Tab bar background, border, and icon colors must use token values.
- [ ] T0.10 Update `app/_layout.tsx` Stack navigation: use design token values for header background and tint instead of hardcoded hex.

### Phase 1 — Admin Role (Manager/Admin UX)

- [ ] T1.1 Redesign `app/(tabs)/index.tsx` admin view: show a role-split layout. When `isAdmin`, render `<AdminDashboard>` component; when `isPharmacist`, render `<PharmacistDashboard>`. Both components live in `components/dashboards/`.
- [ ] T1.2 Create `components/dashboards/AdminDashboard.tsx`: KPI cards (today's revenue, sales count, active debts, alerts count), recent sales list, branch selector. Fetch from existing `/api/stats` endpoint.
- [ ] T1.3 Redesign `app/(tabs)/reports.tsx` (Manager-only tab): segmented control for Daily/Weekly/Monthly view. Display revenue, cost, profit, transactions count. Use `<Card>` from T0.3. Fetch from existing `/api/reports/sales`.
- [ ] T1.4 Create `app/reports/financial.tsx` deep-dive financial screen: expense breakdown, profit margin chart (using `react-native-svg` or simple bar chart), branch comparison. Link from reports tab.
- [ ] T1.5 Redesign `app/(tabs)/smart-orders.tsx` (Manager-only): smart order recommendation cards with item name, current stock, suggested qty, supplier. Quick "Approve Order" action button.
- [ ] T1.6 Redesign `app/(tabs)/purchases.tsx` (Manager-only): purchase order list with status badges (Pending/Received/Cancelled). Quick "Receive" action navigates to existing `app/purchases/[id]/receive.tsx`.
- [ ] T1.7 Create `app/accounting/` directory improvements: `expenses.tsx` should use `<Card>` and `<Badge>` from Phase 0 components; add expense category filter.

### Phase 2 — Pharmacist Role (POS & Fast Actions)

- [ ] T2.1 Create `components/dashboards/PharmacistDashboard.tsx`: shift summary card (sales today, amount collected), quick action buttons (New Sale, Scan Barcode, Search Drug, View Debts), recent alerts preview.
- [ ] T2.2 Redesign `app/(tabs)/sales.tsx` POS screen: start state shows barcode scanner (using existing `expo-camera`), below it a search bar, cart on lower 40% of screen. Quick-add row for recently sold items. Drug interaction banner before checkout (existing `/api/pos/alerts`).
- [ ] T2.3 Create `app/checkout/payment.tsx` enhanced payment flow: payment method selector (Cash/Card/ZainCash/Debit), amount display, change calculator, confirm → print receipt via existing printer service.
- [ ] T2.4 Redesign `app/(tabs)/debts.tsx` Pharmacist debt view: patient cards with outstanding balance pill, "Pay Now" button that opens inline payment form. Use `<Card>`, `<Badge>` from Phase 0.
- [ ] T2.5 Redesign `app/(tabs)/inventory.tsx`: split into tabs (All / Low Stock / Expiring). Each drug card shows stock level badge (green/yellow/red), days-to-expiry chip. Search bar pinned at top.
- [ ] T2.6 Create `app/scan.tsx` enhanced barcode scan result screen: show drug card with name, stock, price; Add to Cart button and Add to Patient button side by side.

### Phase 3 — Push Notifications

- [ ] T3.1 Add `expo-notifications` to `apps/mobile/package.json` via `pnpm add expo-notifications --filter mobile`.
- [ ] T3.2 Configure `app.json` with `expo.plugins: [["expo-notifications", { icon: "./assets/notification-icon.png", color: "#0F7575" }]]` and required Android/iOS permission strings.
- [ ] T3.3 Create `apps/mobile/services/notifications.ts` with: `requestPermission()`, `registerPushToken()` (calls `PUT /api/notifications/push`), `scheduleLocalNotification()`, `addNotificationListener()`.
- [ ] T3.4 Update `app/_layout.tsx` root to call `notifications.requestPermission()` and `notifications.registerPushToken()` after successful login. Store result in AuthContext.
- [ ] T3.5 Add `NotificationType` enum and `Notification` model to `apps/web/prisma/schema.prisma` with fields: `id UUID`, `tenantId`, `userId String?`, `branchId String?`, `title String`, `body String`, `type NotificationType`, `data Json?`, `isRead Boolean default false`, `readAt DateTime?`, `createdAt DateTime`.
- [ ] T3.6 Generate Prisma migration: `prisma migrate dev --name add_notification_model`.
- [ ] T3.7 Create web API route `apps/web/app/api/notifications/in-app/route.ts`: GET returns unread notifications for current user (sorted by createdAt desc, limit 50); POST marks notifications as read.
- [ ] T3.8 Create `services/notificationTriggers.ts` (web) utility: `sendAndPersistNotification({ type, title, body, targetUserIds, tenantId, branchId? })` — persists to DB and calls Expo API.
- [ ] T3.9 Wire low-stock trigger: in `apps/web/app/api/inventory/route.ts` (or wherever inventory quantity is updated), call `sendAndPersistNotification` when `quantity ≤ reorderLevel`.
- [ ] T3.10 Wire expiry trigger: in `apps/web/app/api/purchases/` receive endpoint, call `sendAndPersistNotification` for batches with `expiryDate ≤ today + 30 days`.
- [ ] T3.11 Wire new-purchase trigger: in purchase order creation route, notify manager-role users in the same tenant.
- [ ] T3.12 Redesign `app/(tabs)/alerts.tsx` in-app notification center: fetch from new `/api/notifications/in-app`, show unread count badge on tab, mark-as-read on tap. Use `<Card>` + `<Badge>` from Phase 0.
- [ ] T3.13 Update tab badge in `app/(tabs)/_layout.tsx` to count unread in-app notifications (not just expiry alerts).

### Phase 4 — Two-Way Sync & Real-Time Architecture

- [ ] T4.1 Create `apps/mobile/context/SyncContext.tsx` with: `SyncProvider`, `useSyncStatus()` hook exposing `{ lastSyncedAt: Record<string, Date>, isSyncing, triggerSync }`.
- [ ] T4.2 Create `apps/mobile/services/polling.ts`: configurable interval polling manager with `register(key, fetchFn, intervalMs)` and `unregister(key)`. Respects app foreground/background state via `AppState`.
- [ ] T4.3 Update `app/(tabs)/_layout.tsx` header to include sync status: small dot (green = synced, yellow = syncing, red = error) + "آخر تحديث: X دقائق" label.
- [ ] T4.4 Register polling jobs in `app/(tabs)/_layout.tsx` `useEffect`:
  - `alerts` / `notifications`: every 30s
  - `inventory` (low-stock only): every 2 min
  - `stats` (dashboard KPIs): every 5 min
- [ ] T4.5 Implement optimistic sale creation in `app/(tabs)/sales.tsx`: on "Confirm Sale", immediately: (a) write to local SQLite, (b) show success animation, (c) background-sync to server, (d) on server error — show retry toast, mark sale as "pending".
- [ ] T4.6 Create web API endpoint `apps/web/app/api/sync/notifications/route.ts`: accepts `?since=ISO_TIMESTAMP` and returns new/updated notifications since that timestamp, enabling incremental mobile sync without full re-fetch.
- [ ] T4.7 Update `apps/mobile/services/sync.ts` to use `SyncContext` `triggerSync()` and report status back via context rather than fire-and-forget.
- [ ] T4.8 Add retry logic to `apps/mobile/services/api.ts`: on network error, retry up to 3 times with exponential backoff (1s, 2s, 4s) before surfacing error to UI.

### Phase 5 — Polish & Quality

- [ ] T5.1 Add loading skeleton screens (using `<Skeleton>` from T0.8) to all tabs — no more white flash on data load.
- [ ] T5.2 Add pull-to-refresh (`RefreshControl`) on all list screens (inventory, debts, alerts, purchases) that triggers `SyncContext.triggerSync()`.
- [ ] T5.3 Add haptic feedback (`expo-haptics`) on: successful sale, successful payment, navigation tab press, error states.
- [ ] T5.4 Audit all screens for remaining `StyleSheet.create` hardcoded hex values and replace with `constants/colors.ts` tokens or NativeWind classes.
- [ ] T5.5 Add RTL animations: screen transitions should slide right-to-left (RTL-correct) using Reanimated (already installed).
- [ ] T5.6 Create `app/settings/notifications.tsx` settings screen: toggle push notification categories (low-stock, expiry, purchases), test notification button, shows current device push token (debug info).
- [ ] T5.7 Implement deep linking: push notifications tap opens the relevant screen (`/alerts`, `/inventory`, `/purchases/[id]`).

---

## 4. Non-Goals (Out of Scope for This Epic)

- Patient-facing mobile app (separate product)
- WebSocket server infrastructure (deferred to Epic 007)
- Offline-capable mobile (web API-dependent; desktop handles true offline)
- iOS App Store / Google Play submission process (infra concern)
- In-app barcode generation for labels

---

## 5. Dependencies & Constraints

| Dependency | Details |
|------------|---------|
| `expo-notifications` | Must add to `apps/mobile`. Requires EAS or bare workflow for production push. |
| `react-native-svg` or `victory-native` | Optional — for admin charts in T1.3/T1.4. Only add if chart library chosen. |
| `expo-haptics` | Already available via Expo SDK 54 — no separate install needed. |
| NativeWind v2 | Already installed. **Do NOT upgrade to v4** without a full migration plan. |
| Prisma `Notification` model | Must migrate `apps/web/prisma/schema.prisma` only. Desktop schema untouched (cloud-only feature). |
| Expo Push API | Free tier sufficient. Requires `expoPushToken` stored on User (already exists). |

---

## 6. Constitution Compliance

| Principle | Compliance |
|-----------|------------|
| I. Spec-Driven | ✅ This spec precedes all implementation |
| II. Offline-First (Desktop) | ✅ Desktop scope not touched; mobile optimistic writes to SQLite |
| III. Platform Security | ✅ Push tokens stored in SecureStore; registered server-side via authenticated endpoint |
| IV. Monorepo Discipline | ✅ All installs via `pnpm add --filter mobile`; no cross-app imports |
| V. Schema as Source of Truth | ✅ `Notification` model added to `apps/web/prisma/schema.prisma` with migration |
| VI. UI Consistency (TailwindCSS) | ✅ All new components use NativeWind className; StyleSheet migration included in Phase 0 & T5.4 |
