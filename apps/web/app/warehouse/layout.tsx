// المرحلة 3 من ميزة المذاخر: هيكل بوابة المذخر — تبويبات التنقل + حراسة الدور.
// Phase 3 (الأدوار والصلاحيات): إخفاء التبويبات التي لا يملك الفاعل صلاحية
// عرضها — واجهة فقط (UX)، وليست الحماية الفعلية: بوابات الـ API
// (requireWarehousePermission) هي التطبيق الحقيقي، حتى لو استُدعي مسار
// مخفيّ هنا مباشرة.
//
// تعديل تصميمي (تحسين شامل للواجهة): استُبدل الشريط الأفقي المسطّح بعشر
// تبويبات متساوية الوزن بشريط جانبي مُجمَّع (نمط app/ui/dashboard/sidenav.tsx)
// — انظر WarehouseSideNav.tsx للعرض التفاعلي (الحالة النشطة، الدرج للجوال،
// تسجيل الخروج). هذا الملف يبقى المصدر الوحيد لقائمة TABS وفلترتها بالصلاحيات
// — لم يتغيّر منطق الفلترة (نفس المفتاح requires، ونفس شرط الفلترة) حرفياً،
// أُضيف فقط حقل group للتجميع البصري ولا يؤثر على أي حساب صلاحية.
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { decideWarehouseContext } from "@/app/lib/warehouse-context";
import WarehouseNotifications from '@/app/ui/warehouse-notifications';
import {
    getWarehousePermissions,
    WAREHOUSE_ROLE_LABELS,
    WAREHOUSE_PAGES,
    type WarehousePermissions,
} from "@/app/lib/warehouse-permissions";
import WarehouseSideNav from "./_components/WarehouseSideNav";

export const dynamic = "force-dynamic";

// مصدر الحقيقة لثلاثي href/label/requires هو WAREHOUSE_PAGES في
// warehouse-permissions.ts الآن (يشاركه أيضاً accessiblePages في لوحة
// الصلاحيات بـ UsersClient.tsx، فلا يمكن أن ينحرف هذا التنقّل عنها). هذا
// الملف يبقى المصدر الوحيد للتجميع البصري (group) فوقها — TAB_GROUP مكتوبة
// كنوع مُخطَّط (mapped type) على اتحاد حرفي لكل href في WAREHOUSE_PAGES
// عمداً: أي href يُضاف/يُحذف هناك دون تحديث هذه الخريطة يفشل عند البناء
// (compile error: مفتاح ناقص أو زائد)، فلا يمكن أن يسقط تبويب من التجميع
// بصمت وقت التشغيل فقط كما لو كانت مجرد Record<string, string>.
const TAB_GROUP: { [Href in (typeof WAREHOUSE_PAGES)[number]["href"]]: string } = {
    // العمليات
    "/warehouse": "العمليات",
    "/warehouse/orders": "العمليات",
    // المرحلة 5 (الصقل التجاري): طلبات إرجاع الصيدليات على الطلبات المُسلَّمة.
    "/warehouse/returns": "العمليات",
    // المندوبون: بيع ميداني من بضاعة السيارة — عملية يومية كبقية هذه المجموعة.
    "/warehouse/reps": "العمليات",
    // المخزون
    "/warehouse/catalog": "المخزون",
    // المرحلة ب من ميزة تتبّع المخزون: صفحة المخزون (دفعات/جرد/إتلاف/حركات).
    "/warehouse/stock": "المخزون",
    // المرحلة 4 (طباعة الباركود والملصقات): ورقة طباعة ملصقات الأسعار من نفس
    // كتالوج المذخر — تنتمي منطقياً لمجموعة المخزون كصفحة "أدويتي" و"المخزون".
    "/warehouse/labels": "المخزون",
    // التجارة
    // Phase 2 (الحسابات والعملاء): شروط التعامل التجاري مع كل صيدلية وكشف
    // حسابها، ولوحة الذمم المدينة الإجمالية مع تقادمها.
    "/warehouse/customers": "التجارة",
    "/warehouse/accounts": "التجارة",
    // مشتريات المذخر وذممه الدائنة (الاتجاه المعاكس للحسابات/العملاء أعلاه).
    "/warehouse/purchases": "التجارة",
    // المرحلة 4 (التقارير والأداء): سبعة تقارير مبنية على بيانات الطلبات
    // المشحونة/المخزون/الذمم — انظر app/warehouse/reports/page.tsx للحراسة
    // الفعلية على مستوى الصفحة (هذا التبويب واجهة فقط، كبقية التبويبات هنا).
    "/warehouse/reports": "التجارة",
    // الإدارة
    // Feature 1/2 من الميزات الثلاث الأخيرة: إدارة حسابات المستخدمين وتغيير
    // كلمة المرور الذاتي. تظهر "المستخدمون" فقط لمن يملك canManageUsers —
    // الصفحة نفسها تعرض أيضاً رسالة بديلة كخط دفاع ثانٍ (انظر
    // app/warehouse/users/page.tsx).
    "/warehouse/users": "الإدارة",
    "/warehouse/settings": "الإدارة",
};

const TABS: { href: string; label: string; group: string; requires?: keyof WarehousePermissions }[] =
    WAREHOUSE_PAGES.map((p) => ({ ...p, group: TAB_GROUP[p.href] }));

const GROUP_ORDER = ["العمليات", "المخزون", "التجارة", "الإدارة"];

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (!session?.user) redirect("/login");

    const decision = decideWarehouseContext({
        role: session.user.role || "",
        warehouseId: (session.user as any).warehouseId || undefined,
    });
    if (!decision.ok) redirect("/dashboard");

    const [warehouse, actor] = await Promise.all([
        prisma.warehouse.findUnique({
            where: { id: decision.warehouseId },
            select: { name: true },
        }),
        // استعلام حي عن الفاعل — warehouseUserType/permissions ليسا في
        // الجلسة (انظر warehouse-context.ts)، فتخفيض دور أو سحب صلاحية عرض
        // ينعكس على التنقل فوراً في الطلب التالي.
        prisma.user.findUnique({
            where: { id: session.user.id! },
            select: { warehouseUserType: true, permissions: true },
        }),
    ]);

    const permissions = getWarehousePermissions(actor ?? { warehouseUserType: null, permissions: null });
    // نفس تعبير الفلترة حرفياً كما كان قبل هذا التعديل — التجميع البصري
    // (أدناه) يُطبَّق على نتيجتها، لا يُغيّرها.
    const visibleTabs = TABS.filter((t) => !t.requires || permissions[t.requires]);

    const groups = GROUP_ORDER.map((label) => ({
        label,
        tabs: visibleTabs.filter((t) => t.group === label).map((t) => ({ href: t.href, label: t.label })),
    })).filter((g) => g.tabs.length > 0);

    const roleLabel = actor?.warehouseUserType ? (WAREHOUSE_ROLE_LABELS[actor.warehouseUserType] ?? null) : null;

    return (
        // md:h-screen + md:overflow-hidden مع overflow-y-auto على <main> فقط —
        // نفس نمط app/dashboard/layout.tsx: القائمة الجانبية (وزر تسجيل الخروج
        // في أسفلها) تبقى ثابتة الارتفاع، ومحتوى الصفحة (جدول قد يبلغ مئات
        // الصفوف) هو من يتمرَّر، لا الصفحة كلها. تحت md تبقى الصفحة بأكملها
        // قابلة للتمرير العادي (بلا h-screen) لأن الدرج هناك fixed لا يشغل تخطيطاً.
        // warehouse-shell / warehouse-shell-main: علامتان صريحتان يستهدفهما
        // @media print في app/globals.css (المرحلة 4: طباعة الباركود والملصقات) —
        // انظر التعليق هناك لسبب عدم كفاية إخفاء <aside> وحده لمنع تسرّب قصّ
        // الارتفاع (h-screen/overflow-hidden/overflow-y-auto) إلى ورقة الطباعة.
        <div className="warehouse-shell flex min-h-screen flex-col bg-muted/60 text-foreground dark:bg-background md:h-screen md:flex-row md:overflow-hidden" dir="rtl">
            <WarehouseSideNav
                groups={groups}
                warehouseName={warehouse?.name ?? "المذخر"}
                userEmail={session.user.email ?? ""}
                roleLabel={roleLabel}
            />
            <main className="warehouse-shell-main min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:overflow-y-auto md:px-10 md:py-8 lg:px-12">
                {permissions.canViewOrders && <div className="mb-4 flex justify-end"><WarehouseNotifications portal /></div>}
                <div className="mx-auto w-full max-w-[1600px]">{children}</div>
            </main>
        </div>
    );
}
