# Tasks: تطبيق حدود الباقات (Plan Enforcement)

**Feature Branch**: `010-plan-enforcement`
**Input**: `specs/010-plan-enforcement/spec.md`
**Generated**: 2026-03-12
**Last Updated**: 2026-03-13 — تحديث حالة التنفيذ بعد المراجعة والإصلاح

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1–US5)

---

## Phase 1: Setup (قاعدة البيانات والأنواع)

**Purpose**: تحديث الـ schema وإضافة أنواع البيانات الجديدة — يجب اكتمالها قبل أي شيء آخر

- [x] T001 إضافة حقول `maxDevices Int? @default(1)` و`maxMobileUsers Int? @default(1)` لـ model `SubscriptionPlan` في `apps/web/prisma/schema.prisma`
- [x] T002 إضافة حقول `maxDevices Int?` و`maxMobileUsers Int?` كـ nullable override fields لـ model `Organization` في `apps/web/prisma/schema.prisma`
- [x] T003 إضافة model `MobileSession` لتتبع جلسات الموبايل النشطة في `apps/web/prisma/schema.prisma` — حقول: id, userId, organizationId, createdAt, lastSeenAt, isActive
- [x] T004 تشغيل `pnpm prisma migrate dev --name add-plan-enforcement` في `apps/web/` لتطبيق التغييرات
- [x] T005 [P] إنشاء ملف `apps/web/app/lib/plan-features.ts` يعرّف type `PlanFeatureFlags` بجميع الـ flags: `advancedReports`, `productMovement`, `supplierManagement`, `granularPermissions`, `warehouseManagement`, `interBranchTransfers`, `marketplace`
- [ ] T006 إضافة حقل `maxDevices Int? @default(1)` لـ model `DeviceLicense` في `apps/desktop/prisma/schema.prisma` (للتزامن) — اختياري، يُطبَّق فقط إذا كان الـ desktop schema منفصلاً

**Checkpoint**: ✅ Schema جاهز — يمكن البدء بالتنفيذ

---

## Phase 2: Foundational (دوال الحماية المركزية)

**Purpose**: بناء `saas-guards.ts` الموسّع — يجب اكتماله قبل تطبيق أي قيد

**⚠️ CRITICAL**: جميع مراحل User Stories تعتمد على هذه المرحلة

- [x] T007 توسيع `apps/web/app/lib/saas-guards.ts`: إضافة `"devices"` و`"mobileUsers"` لـ type `PlanLimitResource`، وتحديث `FREE_PLAN_LIMITS` ليشمل `maxDevices: 1` و`maxMobileUsers: 1`
- [x] T008 إضافة دالة `checkDeviceLimit(organizationId)` في `apps/web/app/lib/saas-guards.ts` — تحسب عدد DeviceLicense النشطة مقارنة بـ `org.maxDevices ?? plan.maxDevices ?? 1`، تُعيد `PlanLimitResult`
- [x] T009 إضافة دالة `checkMobileSessionLimit(organizationId)` في `apps/web/app/lib/saas-guards.ts` — تحسب عدد MobileSession النشطة لأدوار ADMIN/PHARMACIST فقط، تُعيد `PlanLimitResult`
- [x] T010 إنشاء دالة `checkFeatureAccess(organizationId, flag: keyof PlanFeatureFlags)` في `apps/web/app/lib/saas-guards.ts` — تقرأ `features` JSON من الخطة، تُعيد `{ allowed: boolean, requiredPlan: string }`
- [x] T011 إنشاء helper `getPlanFeatures(organizationId)` في `apps/web/app/lib/saas-guards.ts` يُعيد `PlanFeatureFlags` مع default values للـ FREE plan (جميع flags = false)

**Checkpoint**: ✅ دوال الحماية جاهزة

---

## Phase 3: User Story 1 — حد أجهزة الكاشير (Priority: P1) 🎯 MVP

**Goal**: منع تفعيل أجهزة كاشير تتجاوز حد الباقة

**Independent Test**: مؤسسة على الباقة الأساسية لديها جهاز واحد → محاولة تفعيل جهاز ثانٍ → يجب رفض الطلب بـ 403 مع رسالة عربية واضحة

### Implementation

- [x] T012 [US1] تعديل `apps/web/app/api/license/activate/route.ts`: استدعاء `checkDeviceLimit(orgId)` قبل إنشاء DeviceLicense جديد — إذا `!allowed` إعادة `{ error: "لقد وصلت للحد الأقصى من الأجهزة في باقتك (${max} جهاز). يرجى الترقية.", code: "DEVICE_LIMIT_EXCEEDED", currentPlan, max }` بـ status 403
- [x] T013 [US1] تعديل `apps/web/app/api/admin/provision-tenant/route.ts`: قبول `planId` من الـ body وتمرير `planId`, `maxDevices`, `maxMobileUsers` من الخطة عند إنشاء Organization في الـ transaction
- [x] T014 [US1] تعديل `apps/web/app/api/admin/tenants/route.ts` (POST handler): إضافة `maxDevices` و`maxMobileUsers` للـ body المقبول وتمريرهما لـ Organization عند الإنشاء
- [x] T015 [P] [US1] تحديث `apps/web/app/api/license/verify/route.ts`: تضمين معلومات الحد الحالي (`currentDevices`, `maxDevices`) في الـ response

**Checkpoint**: ✅ US1 — تفعيل الأجهزة محمي بحدود الباقة

---

## Phase 4: User Story 2 — حد تطبيقات الموبايل (Priority: P1)

**Goal**: منع تسجيل دخول مستخدمي الموبايل (ADMIN/PHARMACIST) فوق الحد المسموح

**Independent Test**: مؤسسة على الباقة الأساسية بها جلسة موبايل واحدة نشطة → محاولة تسجيل دخول مستخدم ثانٍ → رفض مع رسالة عربية

### Implementation

- [x] T016 [US2] إنشاء endpoint `POST /api/mobile/session` في `apps/web/app/api/mobile/session/route.ts` — يقبل `userId`، يحل `organizationId` تلقائياً من الـ DB، يستدعي `checkMobileSessionLimit(orgId)` ثم يُنشئ `MobileSession` record إذا سُمح، يُعيد 403 مع رسالة عربية إذا امتلأ الحد
- [x] T017 [US2] إنشاء endpoint `DELETE /api/mobile/session` في `apps/web/app/api/mobile/session/route.ts` — يقبل `userId`، يحل `organizationId` من الـ DB، يضع `isActive = false` على الـ MobileSession لإطلاق المقعد
- [x] T018 [US2] تعديل `apps/mobile/services/auth.ts`: بعد تسجيل الدخول بنجاح لأدوار ADMIN/PHARMACIST استدعاء `POST /api/mobile/session` — إذا فشل (403) إظهار رسالة الخطأ العربية وإلغاء الجلسة (حذف token)
- [x] T019 [US2] تعديل `apps/mobile/services/auth.ts`: عند تسجيل الخروج استدعاء `DELETE /api/mobile/session` لإطلاق المقعد قبل حذف التوكن
- [x] T020 [P] [US2] إضافة cleanup task: إنشاء `apps/web/app/api/mobile/session/cleanup/route.ts` — يُلغي MobileSessions التي لم تُحدَّث منذ أكثر من 24 ساعة (للتعامل مع الجلسات المنسية)

**Checkpoint**: ✅ US2 — جلسات الموبايل محمية بحدود الباقة

---

## Phase 5: User Story 3 — Feature Gating للباقة الاحترافية (Priority: P2)

**Goal**: حجب الميزات الاحترافية عن مستخدمي الباقة الأساسية مع عرض شاشة ترقية

**Independent Test**: مستخدم على الباقة الأساسية يفتح `/dashboard/inventory/product-movement` → يرى شاشة "هذه الميزة متاحة في الباقة الاحترافية" بدلاً من المحتوى

### Implementation

- [x] T021 [P] [US3] إنشاء component `UpgradeRequired` في `apps/web/app/ui/plan-enforcement/UpgradeRequired.tsx` — يعرض: اسم الميزة، الباقة المطلوبة، وصف مختصر، زر "ترقية الآن" يقود لـ `/dashboard/settings/billing`
- [x] T022 [P] [US3] إنشاء server utility `requireFeature(organizationId, flag)` في `apps/web/app/lib/page-guards.ts` — إذا لم يُسمح يُعيد props لـ `UpgradeRequired` بدلاً من redirect (لإبقاء URL محافظ)
- [x] T023 [US3] تعديل `apps/web/app/dashboard/inventory/product-movement/page.tsx`: إضافة `await requireFeature(orgId, 'productMovement')` في بداية الـ server component — عرض `<UpgradeRequired>` إذا لم يُسمح
- [x] T024 [P] [US3] تعديل `apps/web/app/dashboard/reports/profit/page.tsx`: إضافة فحص `advancedReports`
- [x] T025 [P] [US3] تعديل `apps/web/app/dashboard/reports/profits/page.tsx`: إضافة فحص `advancedReports`
- [x] T026 [P] [US3] تعديل `apps/web/app/dashboard/reports/branch-comparison/page.tsx`: إضافة فحص `advancedReports`
- [x] T027 [P] [US3] تعديل `apps/web/app/dashboard/reports/analytics/page.tsx` وملف demand-forecast المناظر: إضافة فحص `advancedReports`
- [x] T028 [P] [US3] تعديل `apps/web/app/dashboard/reports/audit-log/page.tsx` (أو المسار المناظر): إضافة فحص `advancedReports`
- [x] T029 [P] [US3] تعديل `apps/web/app/dashboard/suppliers/page.tsx`: إضافة فحص `supplierManagement`
- [x] T030 [P] [US3] تعديل `apps/web/app/dashboard/users/permissions/page.tsx`: إضافة فحص `granularPermissions`
- [x] T031 [US3] حماية API routes للميزات الاحترافية: إضافة `checkFeatureAccess` في `apps/web/app/api/suppliers/route.ts` و`apps/web/app/api/reports/profit/route.ts` و`apps/web/app/api/inventory/product-movement/route.ts` — إعادة 403 مع `{ code: "FEATURE_NOT_IN_PLAN", requiredPlan: "PROFESSIONAL" }` ✅ مكتمل بعد إضافة `guardFeature` لـ profit route
- [x] T032 [US3] البحث عن مكوّن الـ sidebar الرئيسي في `apps/web/` وإضافة أيقونة قفل للميزات الاحترافية المحجوبة بدلاً من إخفائها (استخدام `getPlanFeatures` لتحديد ما يُقفل)

**Checkpoint**: ✅ US3 — الميزات الاحترافية محجوبة عن الباقة الأساسية

---

## Phase 6: User Story 4 — Feature Gating لباقة الشركات (Priority: P2)

**Goal**: حجب ميزات الشركات عن مستخدمي الباقتين الأساسية والاحترافية

**Independent Test**: مستخدم احترافي يفتح `/dashboard/warehouses` → يرى شاشة "هذه الميزة متاحة في باقة الشركات فقط"

### Implementation

- [x] T033 [P] [US4] تعديل `apps/web/app/dashboard/warehouses/page.tsx`: إضافة فحص `warehouseManagement`
- [x] T034 [P] [US4] تعديل `apps/web/app/dashboard/marketplace/page.tsx`: إضافة فحص `marketplace`
- [x] T035 [P] [US4] تعديل `apps/web/app/dashboard/inventory/transfers/page.tsx`: إضافة فحص `interBranchTransfers`
- [x] T036 [P] [US4] تعديل `apps/web/app/dashboard/inventory/shortages/page.tsx`: إضافة فحص `interBranchTransfers`
- [x] T037 [US4] حماية API routes لميزات الشركات: إضافة `checkFeatureAccess` في `apps/web/app/api/warehouses/route.ts` و`apps/web/app/api/marketplace/route.ts` و`apps/web/app/api/inventory/transfers/route.ts` — إعادة 403 مع `{ code: "FEATURE_NOT_IN_PLAN", requiredPlan: "ENTERPRISE" }`
- [x] T038 [US4] تحديث sidebar (نفس ملف T032): إضافة أيقونة قفل لميزات الشركات مع تمييز بصري مختلف (Enterprise badge)

**Checkpoint**: ✅ US4 — ميزات الشركات محجوبة عن الباقات الأدنى

---

## Phase 7: User Story 5 — لوحة الإدارة (Priority: P3)

**Goal**: تمكين SUPER_ADMIN من إدارة حدود الأجهزة والموبايل وجميع feature flags من الواجهة

**Independent Test**: SUPER_ADMIN يفتح `/admin/plans` → يرى ويعدل حقول maxDevices, maxMobileUsers, وجميع الـ flags → يتحقق من تطبيق التغييرات فوراً

### Implementation

- [x] T039 [P] [US5] تعديل `apps/web/app/lib/actions/plans.ts`: إضافة `maxDevices`, `maxMobileUsers`, `features` للـ `createPlan` و`updatePlan` server actions (CRUD عبر server actions وليس API route مباشر)
- [x] T040 [US5] تعديل `apps/web/app/dashboard/admin/plans/page.tsx`: إضافة حقول `maxDevices` و`maxMobileUsers` للنموذج، وإضافة قسم "Feature Flags" بـ toggles لكل flag (`advancedReports`, `productMovement`, `supplierManagement`, `granularPermissions`, `warehouseManagement`, `interBranchTransfers`, `marketplace`) — منفذ في `apps/web/app/ui/admin/plan-form.tsx`
- [x] T041 [P] [US5] تعديل `apps/web/app/api/admin/tenants/[id]/route.ts`: إضافة `maxDevices` و`maxMobileUsers` لـ PATCH body المقبول كـ override fields للمؤسسة
- [x] T042 [US5] تعديل `apps/web/app/dashboard/admin/tenants/page.tsx`: إضافة حقلي override جديدين (`maxDevices`, `maxMobileUsers`) للنموذج مع نفس pattern الحقول الموجودة (maxBranches/maxUsers) ✅ مكتمل
- [x] T043 [US5] تحديث `apps/web/prisma/seed-plans.ts` بالقيم الصحيحة المطابقة لصفحة التسعير:
  - الأساسية: `maxDevices:1, maxMobileUsers:1, features:{advancedReports:false, productMovement:false, supplierManagement:false, granularPermissions:false, warehouseManagement:false, interBranchTransfers:false, marketplace:false}`
  - الاحترافية: `maxDevices:3, maxMobileUsers:3, features:{advancedReports:true, productMovement:true, supplierManagement:true, granularPermissions:true, warehouseManagement:false, interBranchTransfers:false, marketplace:false}`
  - الشركات: `maxDevices:-1, maxMobileUsers:-1, features:{...all true}`
- [ ] T044 [US5] تشغيل `pnpm prisma db seed` للتأكد من تحميل القيم الجديدة في بيئة التطوير — **⚠️ يتطلب تشغيل يدوي**

**Checkpoint**: ✅ US5 — لوحة الإدارة تدعم إدارة جميع الحدود والـ flags

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T045 [P] إضافة `maxDevices` و`maxMobileUsers` لـ `FREE_PLAN_LIMITS` في `apps/web/app/lib/saas-guards.ts` والتحقق من أن المؤسسات التي لا تملك خطة تحصل على القيم الافتراضية الصحيحة
- [x] T046 [P] تعديل `apps/web/app/api/license/verify/route.ts`: تضمين `planFeatures` في الـ response لاستخدامه في الـ desktop app مستقبلاً
- [ ] T047 مراجعة جميع صفحات الـ reports في `apps/web/app/dashboard/reports/` والتحقق من أن فحص `advancedReports` مُطبَّق على جميع صفحات التقارير المتقدمة التي فاتت في T024–T028 — **⚠️ يتطلب مراجعة يدوية لأي صفحات reports جديدة تُضاف**
- [ ] T048 [P] تحديث `apps/web/app/dashboard/settings/billing/page.tsx` إذا وجد: عرض الحدود الحالية للخطة (maxDevices المستخدم/المسموح, maxMobileUsers المستخدم/المسموح)
- [ ] T049 التحقق من أن `apps/web/middleware.ts` لا يتعارض مع الحماية الجديدة (فحص أن checkPlanLimit الموجود يعمل بالتوازي مع الـ guards الجديدة بدون تكرار) — **⚠️ يتطلب مراجعة يدوية**

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Schema)
    └── Phase 2 (Guards) ← BLOCKS all user stories
            ├── Phase 3 (US1: Devices)     ← يمكن تشغيله بعد Phase 2
            ├── Phase 4 (US2: Mobile)      ← يمكن تشغيله بعد Phase 2
            ├── Phase 5 (US3: Pro Gating)  ← يمكن تشغيله بعد Phase 2
            ├── Phase 6 (US4: Ent Gating)  ← يمكن تشغيله بعد Phase 2
            └── Phase 7 (US5: Admin)       ← يمكن تشغيله بعد Phase 2
                        └── Phase 8 (Polish) ← بعد اكتمال الكل
```

### User Story Dependencies

- **US1 (P1)**: تبدأ بعد Phase 2 — مستقلة تماماً
- **US2 (P1)**: تبدأ بعد Phase 2 — مستقلة تماماً (ملفات مختلفة عن US1)
- **US3 (P2)**: تبدأ بعد Phase 2 — تعتمد على T021 (UpgradeRequired component) قبل T023–T030
- **US4 (P2)**: تبدأ بعد Phase 2 — تعتمد على T021 (نفس component من US3)
- **US5 (P3)**: تبدأ بعد Phase 2 — مستقلة عن US3 وUS4

### Within Each Story

- T021 (UpgradeRequired) يجب أن يكتمل قبل T023–T038
- Schema changes (Phase 1) يجب أن تسبق جميع DB reads
- Guard functions (Phase 2) يجب أن تسبق API route changes

---

## Parallel Opportunities

```bash
# Phase 1 — يمكن تشغيل T005 بالتوازي مع T001-T004
T001+T002+T003 (schema models) → T004 (migration) → T005+T006 (parallel)

# Phase 2 — T007 أولاً ثم T008/T009/T010/T011 معاً
T007 → T008 + T009 + T010 + T011 (parallel)

# US3 Phase 5 — بعد T021+T022:
T023 + T024 + T025 + T026 + T027 + T028 + T029 + T030 (all parallel)

# US4 Phase 6 — كلها متوازية
T033 + T034 + T035 + T036 (all parallel)
```

---

## Implementation Strategy

### MVP (US1 + US2 فقط — أكبر تأثير على الإيرادات)

1. أكمل Phase 1 + Phase 2
2. أكمل Phase 3 (US1 — حد الأجهزة) ← **أوقف وتحقق**
3. أكمل Phase 4 (US2 — حد الموبايل) ← **أوقف وتحقق**
4. الإيرادات محمية — يمكن الشحن

### Incremental Delivery

1. Phase 1 + Phase 2 → قاعدة جاهزة
2. Phase 3 → حماية الأجهزة ✅
3. Phase 4 → حماية الموبايل ✅
4. Phase 5 → Feature gating للاحترافية ✅
5. Phase 6 → Feature gating للشركات ✅
6. Phase 7 → لوحة الإدارة ✅
7. Phase 8 → Polish (جزئي)

---

## Summary

| المرحلة | عدد المهام | المنجز | الملاحظات |
|---------|------------|--------|-----------|
| Phase 1: Setup | 6 | 5/6 | T006 اختياري (desktop schema) |
| Phase 2: Foundational | 5 | 5/5 | ✅ مكتمل |
| Phase 3: US1 Devices | 4 | 4/4 | ✅ مكتمل |
| Phase 4: US2 Mobile | 5 | 5/5 | ✅ مكتمل |
| Phase 5: US3 Pro Gating | 12 | 12/12 | ✅ مكتمل |
| Phase 6: US4 Ent Gating | 6 | 6/6 | ✅ مكتمل |
| Phase 7: US5 Admin | 6 | 5/6 | T044 يتطلب تشغيل seed يدوياً |
| Phase 8: Polish | 5 | 2/5 | T047/T048/T049 يدوية |
| **Total** | **49** | **44/49** | |

### المهام المتبقية (يدوية / غير كود)

| ID | الوصف | الأولوية |
|----|-------|---------|
| T006 | إضافة `maxDevices` لـ desktop schema | منخفضة (اختياري) |
| T044 | تشغيل `pnpm prisma db seed` في بيئة التطوير | عالية |
| T047 | مراجعة صفحات reports الجديدة للتأكد من تطبيق feature gate | متوسطة |
| T048 | تحديث صفحة billing بعرض حدود الخطة الحالية | منخفضة |
| T049 | مراجعة middleware.ts للتأكد من عدم التعارض | متوسطة |

**Parallel opportunities**: ~20 مهمة يمكن تشغيلها بالتوازي
**Suggested MVP scope**: Phase 1 + Phase 2 + Phase 3 + Phase 4 (20 مهمة) ✅ مكتملة
