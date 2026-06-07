# Tasks: المساعد الذكي للصيدلية (AI Pharmacy Assistant)

**Feature Branch**: `011-ai-assistant`
**Target App**: `apps/web` (Next.js App Router)
**Input**: `specs/011-ai-assistant/spec.md`
**Generated**: 2026-05-17
**Last Updated**: 2026-05-17 — تحديث حالة التنفيذ بعد اكتمال Phases 1–6

## Format: `[ID] [P?] [Story?] Status`

- **[P]**: يمكن تشغيلها بالتوازي (ملفات مختلفة، لا تبعيات بينها)
- **[Story]**: رقم قصة المستخدم (US1–US5)
- **Status**: `[ ]` لم تبدأ | `[~]` جارية | `[x]` مكتملة

---

## Phase 1: Dependencies & Environment

**Purpose**: تثبيت مكتبات AI وضبط متغيرات البيئة

- [x] T001 تثبيت `@google/generative-ai` في `apps/web`:
  ```
  pnpm add @google/generative-ai --filter web
  ```
- [x] T002 تثبيت `openai` في `apps/web`:
  ```
  pnpm add openai --filter web
  ```
- [x] T003 [P] إضافة متغيرات البيئة في `apps/web/.env.example` — يجب على المطوّر نسخها لـ `.env`:
  ```env
  AI_PROVIDER=gemini
  GEMINI_API_KEY=
  OPENAI_API_KEY=
  ```

**Checkpoint**: ✅ `pnpm build --filter web` يمر دون أخطاء TypeScript

---

## Phase 2: Data Layer (app/lib/ai-data.ts)

**Purpose**: دوال Prisma مقيّدة بـ tenant — كلها Read-Only — يُعيد كل منها نصاً منسّقاً جاهزاً للـ prompt

**⚠️ CRITICAL**: Phase 3 و Phase 4 تعتمدان على هذه المرحلة كاملة

- [x] T004 إنشاء `apps/web/app/lib/ai-data.ts` — تعريف الأنواع الأساسية وتوقيع الدوال:
  ```typescript
  import type { TenantContext } from '@/app/lib/tenant-utils';
  export type AIDataContext = Pick<TenantContext, 'tenantBranchWhere' | 'organizationId'>;
  ```

- [x] T005 [US1] إضافة `getSalesSummary(from, to, ctx)` في `ai-data.ts`:
  - `prisma.sale.aggregate({ _sum: { total }, _count, where: { ...ctx.tenantBranchWhere, createdAt: { gte, lte } } })`
  - جلب أعلى 5 أدوية مبيعاً: `saleItem groupBy drugId → join GlobalDrug.tradeName`
  - يُعيد نصاً عربياً منسّقاً (ليس object خام)

- [x] T006 [P][US2] إضافة `getSalesByCashier(from, to, ctx)` في `ai-data.ts`:
  - `prisma.sale.groupBy({ by: ['userId'], _sum: { total }, _count, where: {...} })`
  - join مع `prisma.user.findMany()` لجلب الأسماء
  - ترتيب تنازلي حسب المبيعات

- [x] T007 [P][US3] إضافة `getSuspiciousActivity(from, to, ctx)` في `ai-data.ts`:
  - **Price overrides**: `prisma.sale.findMany({ where: { hasPriceOverride: true, ...ctx, createdAt: {...} }, include: { user: { select: { name } }, items: true } })`
  - **Excess discounts**: جلب `CompanySettings.maxDiscountPercent` أولاً ثم `prisma.sale.findMany({ where: { discount: { gt: maxDiscountPercent } } })`
  - **Return anomalies**: مرتجعات أكثر من واحد لنفس `userId` في نفس اليوم

- [x] T008 [P][US4] إضافة `getProfitSummary(from, to, ctx)` في `ai-data.ts`:
  - نفس منطق `apps/web/app/api/reports/profit/route.ts` بالضبط:
    - revenue: `sale.aggregate._sum.total`
    - cogs: `SUM(saleItem.cost × saleItem.quantity)`
    - expenses: `expense.aggregate._sum.amount`
    - returns: `saleReturn.aggregate._sum.total`
    - net: revenue - cogs - expenses - returns

- [x] T009 [P][US4] إضافة `getExpensesSummary(from, to, ctx)` في `ai-data.ts`:
  - `prisma.expense.groupBy({ by: ['category'], _sum: { amount }, where: { ...ctx, date: { gte, lte } } })`

- [x] T010 [P][US4] إضافة `getDebtSummary(ctx)` في `ai-data.ts`:
  - يستخدم `patient.balance > 0` (الرصيد المدين المُخزَّن مباشرة على Patient)
  - إجمالي الديون + أكبر 10 مدينين بالأسماء وأرقام الهاتف

- [x] T011 [P][US5] إضافة `getLowStockItems(ctx)` في `ai-data.ts`:
  - Prisma لا يدعم مقارنة عمود بعمود في `where` — لا تستخدم `{ quantity: { lt: prisma.inventory.fields.minStock } }`
  - الطريقة الصحيحة: جلب الكل ثم filter في JS:
    ```typescript
    const all = await prisma.inventory.findMany({
      where: { ...ctx.tenantBranchWhere },
      include: { drug: { select: { tradeName: true } } },
      select: { quantity: true, minStock: true, drug: true }
    });
    return all
      .filter(i => i.quantity < i.minStock)
      .sort((a, b) => (a.quantity / a.minStock) - (b.quantity / b.minStock));
    ```
  - ملاحظة: الكمية الفعلية = `SUM(inventory.batches[].quantity)` لأن Inventory لا يحتوي على حقل quantity مباشر في web schema

- [x] T012 [P][US5] إضافة `getExpiringBatches(days = 30, ctx)` في `ai-data.ts`:
  - `prisma.batch.findMany({ where: { expiryDate: { lte: addDays(now, days) }, inventory: { ...ctx } }, include: { inventory: { include: { drug: { select: { tradeName } } } } } })`
  - ترتيب تصاعدي حسب expiryDate

- [x] T013 [P] إضافة `getShiftSummary(from, to, ctx)` في `ai-data.ts`:
  - `prisma.shift.findMany({ where: { ...ctx, startTime: { gte, lte } }, include: { user: { select: { name } } } })`
  - حساب فروقات الكاش: `expectedCash - (actualCash ?? expectedCash)`

- [x] T014 [P] إضافة `getUserList(ctx)` في `ai-data.ts`:
  - `prisma.user.findMany({ where: { branch: { organizationId: ctx.organizationId } }, select: { id, name, role } })`
  - يُستخدم لحل أسماء الكاشيرات من الأسئلة الطبيعية

**Checkpoint**: ✅ الملف `apps/web/app/lib/ai-data.ts` مُنشأ (14.9 KB) — 10 دوال مكتملة

---

## Phase 3: AI Provider Layer (app/lib/ai-assistant.ts)

**Purpose**: abstraction للمزودين + question classifier + context builder

- [x] T015 إنشاء `apps/web/app/lib/ai-assistant.ts` — interface + تنفيذ المزودين:
  ```typescript
  export interface ChatMessage { role: 'user' | 'assistant'; content: string }
  interface AIProvider {
    chat(system: string, context: string, message: string, history: ChatMessage[]): Promise<string>
  }
  class GeminiProvider implements AIProvider  { /* gemini-1.5-flash */ }
  class OpenAIProvider implements AIProvider  { /* gpt-4o-mini */ }
  export function createProvider(): AIProvider
  ```

- [x] T016 [P] إضافة `SYSTEM_PROMPT` الاحترافي في `ai-assistant.ts` (راجع spec.md)

- [x] T017 [P] إضافة `classifyQuestion(message: string): QuestionCategory[]` في `ai-assistant.ts`:
  - تُعيد **مصفوفة** لدعم الأسئلة المركّبة — كل keyword pattern يُضيف فئة للمصفوفة:
    ```typescript
    const categories: QuestionCategory[] = [];
    if (/مبيعات|بيع|فاتورة|إجمالي/.test(msg))         categories.push('sales_summary');
    if (/أحمد|كاشير|موظف|الأفضل|أداء/.test(msg))      categories.push('cashier_performance');
    if (/مشبوه|غش|تجاوز|سرقة|غير طبيعي/.test(msg))   categories.push('suspicious');
    if (/ربح|مصاريف|ديون|مورد|خسارة/.test(msg))       categories.push('financial');
    if (/ناقص|صلاحية|مخزن|كمية|منتهي/.test(msg))      categories.push('inventory');
    if (/وردية|شيفت|فتح|أغلق/.test(msg))              categories.push('shifts');
    return categories.length > 0 ? categories : ['general'];
    ```
  - مثال: "مبيعات أحمد المشبوهة" → `['sales_summary', 'cashier_performance', 'suspicious']`

- [x] T018 [P] إضافة `extractDateRange(message)` في `ai-assistant.ts`:
  - يتعرف على: "اليوم"، "هذا الأسبوع"، "الشهر الماضي"، "من الساعة X إلى Y"
  - يُعيد `{ from: Date, to: Date }`
  - default: اليوم الحالي (00:00 → 23:59)

- [x] T019 إضافة `buildContext(message, ctx: AIDataContext)` في `ai-assistant.ts`:
  - يستدعي `classifyQuestion` (يُعيد `QuestionCategory[]`) و `extractDateRange`
  - يستدعي **كل** الدوال المقابلة للفئات المُعادة بالتوازي (`Promise.all`)، ثم يدمج نتائجها في سلسلة نصية واحدة:
    ```typescript
    const categories = classifyQuestion(message);
    const { from, to } = extractDateRange(message);
    const parts = await Promise.all(
      categories.map(cat => fetchForCategory(cat, from, to, ctx))
    );
    return parts.filter(Boolean).join('\n\n---\n\n');
    ```
  - `fetchForCategory` هي switch داخلي يعيد استدعاء الدالة المناسبة من `ai-data.ts`

**Checkpoint**: ✅ الملف `apps/web/app/lib/ai-assistant.ts` مُنشأ (10.1 KB) — TypeScript يمر بدون أخطاء

---

## Phase 4: API Route (app/api/ai/chat/route.ts)

**Purpose**: POST endpoint آمن — auth + tenant isolation + AI call

- [x] T020 إنشاء `apps/web/app/api/ai/chat/route.ts`:
  ```typescript
  export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user)                    return 401 { error: 'Unauthorized' }
    if (session.user.role !== 'ADMIN')     return 403 { error: 'ADMIN only' }
    if (!process.env.AI_PROVIDER)          return 503 { error: 'AI_PROVIDER not configured' }

    const { message, history } = await req.json()
    const tenantCtx = await getTenantContext()
    if (tenantCtx instanceof NextResponse)  return tenantCtx

    const context  = await buildContext(message, tenantCtx)
    const provider = createProvider()
    const response = await provider.chat(SYSTEM_PROMPT, context, message, history)

    return NextResponse.json({ response })
  }
  ```

- [x] T021 [P] إضافة `GET /api/ai/status` في `apps/web/app/api/ai/status/route.ts`:
  - يُعيد `{ provider: 'gemini'|'openai'|null, configured: boolean }`
  - يُستخدم من الـ UI لعرض badge المزود الحالي

**Checkpoint**: ✅ الملفان مُنشآن — `route.ts` (2.2 KB) و `status/route.ts` (0.6 KB)

---

## Phase 5: UI Component (app/ui/ai-assistant/AIAssistantPanel.tsx)

**Purpose**: لوحة المحادثة — Client Component

- [x] T022 إنشاء `apps/web/app/ui/ai-assistant/AIAssistantPanel.tsx` (`'use client'`):
  - State: `messages`, `input`, `loading`, `isOpen`, `provider`, `configured`
  - `fetch('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message, history }) })`
  - Layout: لوحة fixed في الزاوية السفلى اليسرى، عرض 380px، RTL كامل
  - تتبع dark/light class الموجود في المشروع (Tailwind `bg-background`, `bg-muted`)

- [x] T023 [P] إضافة Chat Bubbles في `AIAssistantPanel.tsx`:
  - رسائل المستخدم: bubble يسار (RTL)، خلفية `bg-violet-600 text-white`
  - رسائل المساعد: bubble يمين (RTL)، خلفية `bg-muted`
  - Typing indicator: 3 نقاط `animate-bounce` بـ animationDelay متدرّج
  - Auto-scroll للأسفل (`useRef + scrollIntoView`)

- [x] T024 [P] إضافة Quick Shortcuts في `AIAssistantPanel.tsx`:
  - أزرار: "كم مبيعات اليوم؟" | "ما هي الأدوية الناقصة؟" | "هل هناك حركات مشبوهة؟" | "كم ربحنا هذا الشهر؟"
  - تظهر فقط عند فراغ المحادثة (welcome state)
  - ترسل السؤال مباشرة عند الضغط

- [x] T025 [P] إضافة Header وأدوات التحكم:
  - عنوان: "المساعد الذكي" مع أيقونة Bot
  - badge صغيرة تعرض اسم المزود (Gemini / GPT) — يُجلب من `/api/ai/status` عند mount
  - زر مسح المحادثة مع `window.confirm`
  - زر إغلاق اللوحة

- [x] T026 [P] إضافة Input Field:
  - `<textarea>` RTL، placeholder: "اكتب سؤالك..."
  - Enter = إرسال، Shift+Enter = سطر جديد
  - زر إرسال يتحول لـ `<Loader2 className="animate-spin">` أثناء التحميل
  - عند الوصول لـ 20 رسالة: يظهر تحذير وزر "بدء محادثة جديدة"
  - زر trigger عائم (floating) في الزاوية مع green dot إذا كان المزود مضبوطاً

**Checkpoint**: ✅ الملف `apps/web/app/ui/ai-assistant/AIAssistantPanel.tsx` مُنشأ (12.6 KB)

---

## Phase 6: Dashboard Integration (app/dashboard/layout.tsx)

**Purpose**: دمج المساعد في كل صفحات الـ dashboard

- [x] T027 استيراد `AIAssistantPanel` في `apps/web/app/dashboard/layout.tsx` بـ dynamic import (ssr: false):
  ```typescript
  const AIAssistantPanel = dynamicImport(() => import('../ui/ai-assistant/AIAssistantPanel'), { ssr: false });
  ```

- [x] T028 [P] إضافة `AIAssistantPanel` في الـ layout مشروطاً بدور ADMIN:
  ```tsx
  {userRole === 'ADMIN' && <AIAssistantPanel />}
  ```
  - يظهر أيقونة Bot ثابتة في الزاوية السفلى اليسرى لجميع صفحات الـ dashboard
  - النقر يفتح/يغلق اللوحة — لا يظهر للـ PHARMACIST أو CASHIER

**Checkpoint**: ✅ `layout.tsx` مُحدَّث — TypeScript يمر بدون أخطاء

---

## Phase 7: Testing & QA

- [ ] T029 [P][US1] اختبار US1: سؤال "كم مبيعات اليوم؟" يُطابق `SUM(Sale.total WHERE today AND tenantBranches)` من Prisma مباشرة
- [ ] T030 [P][US1] اختبار النطاقات الزمنية: "هذا الأسبوع"، "الشهر الماضي"، "من 1 مايو إلى 15 مايو" — تُعيد نطاقات صحيحة
- [ ] T031 [P][US2] اختبار US2: سؤال "مبيعات أحمد" يُعيد فقط مبيعات المستخدم المسمى أحمد في الـ tenant
- [ ] T032 [P][US3] اختبار US3: السجلات `hasPriceOverride=true` و `discount > maxDiscountPercent` تظهر في النتيجة
- [ ] T033 [P][US4] اختبار US4: الأرباح = مبيعات - COGS - مصاريف - مرتجعات — تتطابق مع `api/reports/profit`
- [ ] T034 [P][US5] اختبار US5: النواقص تتطابق مع `api/purchases/low-stock`
- [ ] T035 [P] اختبار كلا المزودين: Gemini وOpenAI يُعيدان إجابات عربية صحيحة
- [ ] T036 [P] اختبار Tenant Isolation: مدير مؤسسة A لا يرى بيانات مؤسسة B (حتى لو عبّر عنها في السؤال)
- [ ] T037 [P] اختبار API key خاطئة: رسالة خطأ واضحة بالعربية، لا crash
- [ ] T038 [P] اختبار الأمان: مستخدم PHARMACIST يحصل على 403 من `/api/ai/chat`
- [ ] T039 [P] اختبار حد الرسائل: عند 20 رسالة يظهر التحذير وزر "بدء محادثة جديدة"

**Checkpoint**: جميع User Stories تعمل بثقة — Tenant Isolation محقّق — المساعد جاهز للإنتاج
