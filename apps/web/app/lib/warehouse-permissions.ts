/**
 * warehouse-permissions.ts
 *
 * Phase 3 (الأدوار والصلاحيات) من نظام المذاخر B2B: صلاحيات دقيقة لكل حساب
 * مذخر — يُماثل عمداً بنية app/lib/permissions.ts (التي تخدم جانب الصيدلية)
 * حرفياً: نفس شكل الواجهة (interface)، نفس أسلوب "افتراضيات لكل دور +
 * تخصيصات JSON فوقها"، ونفس توقيعات الدوال — اتساق المنتج بين الجانبين مطلوب
 * صراحة، وليس مجرد صدفة تصميم.
 *
 * لماذا مذخر منفصل عن UserPermissions الخاص بالصيدلية بدل توسيعه: حساب مذخر
 * (role: 'WAREHOUSE') لا ينتمي لأي Organization/Branch ولا يخوض دورة
 * البيع/المخزون/المرضى الخاصة بالصيدلية إطلاقاً — دمج الاثنين في واجهة واحدة
 * كان يعني إما تلويث UserPermissions بمفاتيح لا معنى لها لأي صيدلية، أو
 * العكس. مفتاح التخزين نفسه (User.permissions، عمود JSON نصي واحد) مشترك
 * فعلاً — لا عمود جديد لزم لهذه المرحلة.
 *
 * بلا استيراد Prisma أو next/server هنا عمداً (نفس انضباط app/lib/
 * warehouse-users.ts وapp/lib/warehouse-stock.ts) — هذه دوال نقيّة بحتة
 * قابلة للاختبار مباشرة تحت إعداد vitest في هذا المستودع (الذي لا يحل alias
 * "@/*"). أي استعلام فعلي من قاعدة البيانات عن صف المستخدم يعيش في
 * app/lib/warehouse-permission-guard.ts (طبقة غير نقيّة منفصلة) وفي معالجات
 * المسارات (route handlers) نفسها.
 */

export interface WarehousePermissions {
    // الطلبات
    canViewOrders: boolean;
    canQuoteOrders: boolean; // تسعير ومراجعة الأصناف
    canShipOrders: boolean; // شحن وتسليم

    // الكتالوج والأسعار
    canViewCatalog: boolean;
    canEditCatalog: boolean; // إضافة/حذف أصناف
    canEditPricing: boolean; // تغيير الأسعار
    canImportCatalog: boolean;

    // المخزون
    canViewStock: boolean;
    canReceiveStock: boolean; // تسجيل دفعة واردة
    canAdjustStock: boolean; // جرد وتسوية
    canWriteOffStock: boolean; // إتلاف

    // العملاء والحسابات
    canViewCustomers: boolean;
    canEditCustomerTerms: boolean; // حد ائتمان، مهلة سداد، إيقاف
    canViewFinance: boolean;
    canRecordPayment: boolean;

    // مشتريات المذخر وذممه الدائنة (الاتجاه المعاكس للعملاء/الحسابات أعلاه)
    canViewPurchases: boolean;
    canCreatePurchase: boolean; // تسجيل فاتورة شراء جديدة من مورّد
    canPaySupplier: boolean; // تسجيل دفعة سداد صادرة لمورّد

    // إدارة
    canViewReports: boolean;
    canManageUsers: boolean;
    canChangeSettings: boolean;

    // المندوبون (بيع ميداني)
    canViewReps: boolean; // عرض قائمة المندوبين وبضاعة سياراتهم وعمولاتهم
    canManageReps: boolean; // إنشاء مندوب، تحميل بضاعة سيارته، ضبط نسبة عمولته
    canSellField: boolean; // تسجيل بيع ميداني وتحصيل نقدي
}

/** كل مفاتيح الواجهة أعلاه — مصدر الحقيقة الوحيد لـ "ما هو مفتاح صلاحية مذخر صالح؟". */
const ALL_PERMISSION_KEYS: (keyof WarehousePermissions)[] = [
    'canViewOrders', 'canQuoteOrders', 'canShipOrders',
    'canViewCatalog', 'canEditCatalog', 'canEditPricing', 'canImportCatalog',
    'canViewStock', 'canReceiveStock', 'canAdjustStock', 'canWriteOffStock',
    'canViewCustomers', 'canEditCustomerTerms', 'canViewFinance', 'canRecordPayment',
    'canViewPurchases', 'canCreatePurchase', 'canPaySupplier',
    'canViewReports', 'canManageUsers', 'canChangeSettings',
    'canViewReps', 'canManageReps', 'canSellField',
];

const ALL_FALSE: WarehousePermissions = {
    canViewOrders: false, canQuoteOrders: false, canShipOrders: false,
    canViewCatalog: false, canEditCatalog: false, canEditPricing: false, canImportCatalog: false,
    canViewStock: false, canReceiveStock: false, canAdjustStock: false, canWriteOffStock: false,
    canViewCustomers: false, canEditCustomerTerms: false, canViewFinance: false, canRecordPayment: false,
    canViewPurchases: false, canCreatePurchase: false, canPaySupplier: false,
    canViewReports: false, canManageUsers: false, canChangeSettings: false,
    canViewReps: false, canManageReps: false, canSellField: false,
};

// ── مصفوفة الأدوار (implementée حرفياً كما في المواصفة) ─────────────────────

const OWNER_DEFAULTS: WarehousePermissions = {
    canViewOrders: true, canQuoteOrders: true, canShipOrders: true,
    canViewCatalog: true, canEditCatalog: true, canEditPricing: true, canImportCatalog: true,
    canViewStock: true, canReceiveStock: true, canAdjustStock: true, canWriteOffStock: true,
    canViewCustomers: true, canEditCustomerTerms: true, canViewFinance: true, canRecordPayment: true,
    canViewPurchases: true, canCreatePurchase: true, canPaySupplier: true,
    canViewReports: true, canManageUsers: true, canChangeSettings: true,
    canViewReps: true, canManageReps: true, canSellField: true,
};

const MANAGER_DEFAULTS: WarehousePermissions = {
    canViewOrders: true, canQuoteOrders: true, canShipOrders: true,
    canViewCatalog: true, canEditCatalog: true, canEditPricing: true, canImportCatalog: true,
    canViewStock: true, canReceiveStock: true, canAdjustStock: true, canWriteOffStock: true,
    canViewCustomers: true, canEditCustomerTerms: true, canViewFinance: true,
    // عمداً false: فصل الواجبات (segregation of duties) — من يدير العمليات
    // اليومية (تسعير/مخزون/شروط عملاء) لا يجب أن يكون أيضاً من يستلم المال
    // فعلياً ويسجّله. تسجيل الدفعات يبقى محصوراً بـ OWNER وACCOUNTANT، حتى لو
    // كان المدير يرى كامل الوضع المالي (canViewFinance: true) — رؤية الأرقام
    // شيء، ولمس النقد شيء آخر تماماً. هذا استثناء متعمّد في المصفوفة، وليس
    // سهواً.
    canRecordPayment: false,
    // canPaySupplier عمداً false لنفس سبب canRecordPayment أعلاه بالضبط (فصل
    // الواجبات) — المدير يرى ويُنشئ فواتير الشراء (canViewPurchases/
    // canCreatePurchase) لكن لا يسدّد للمورّد فعلياً.
    canViewPurchases: true, canCreatePurchase: true, canPaySupplier: false,
    canViewReports: true, canManageUsers: false, canChangeSettings: false,
    canViewReps: true, canManageReps: true, canSellField: true,
};

const SALES_DEFAULTS: WarehousePermissions = {
    canViewOrders: true, canQuoteOrders: true, canShipOrders: true,
    canViewCatalog: true, canEditCatalog: false, canEditPricing: false, canImportCatalog: false,
    canViewStock: true, canReceiveStock: false, canAdjustStock: false, canWriteOffStock: false,
    canViewCustomers: true, canEditCustomerTerms: false, canViewFinance: false, canRecordPayment: false,
    // مندوب المبيعات لا علاقة له بمشتريات المذخر من الموردين إطلاقاً.
    canViewPurchases: false, canCreatePurchase: false, canPaySupplier: false,
    canViewReports: true, canManageUsers: false, canChangeSettings: false,
    // المندوبون (بيع ميداني): SALES يملك canViewReps لأن صفحة /warehouse/reps
    // نفسها محروسة به — وبدونه كان مندوب المبيعات يُمنع من الصفحة التي يُفترض
    // أن يبيع منها، فتصبح canSellField صلاحية بلا أثر (رصدها اختبار تماسك
    // الأدوار الخمسة، وكانت خطأً في المواصفة لا في التنفيذ). أما canManageReps
    // — إنشاء مندوب وضبط نسبة عمولته وتحميل بضاعة سيارته — فتبقى للمالك
    // والمدير: المندوب يبيع ولا يحدّد أجر نفسه.
    canViewReps: true, canManageReps: false, canSellField: true,
};

const INVENTORY_DEFAULTS: WarehousePermissions = {
    canViewOrders: true, canQuoteOrders: false, canShipOrders: true,
    canViewCatalog: true, canEditCatalog: true, canEditPricing: false, canImportCatalog: true,
    canViewStock: true, canReceiveStock: true, canAdjustStock: true, canWriteOffStock: true,
    canViewCustomers: false, canEditCustomerTerms: false, canViewFinance: false, canRecordPayment: false,
    // مسؤول المخزون هو من يستلم البضاعة فعلياً — يسجّل فاتورة الشراء (تُنشئ
    // الدفعات مباشرة) لكن لا يسدّد للمورّد (canPaySupplier).
    canViewPurchases: true, canCreatePurchase: true, canPaySupplier: false,
    canViewReports: true, canManageUsers: false, canChangeSettings: false,
    // مسؤول المخزون لا علاقة له بالمندوبين الميدانيين أو عمولاتهم إطلاقاً.
    canViewReps: false, canManageReps: false, canSellField: false,
};

const ACCOUNTANT_DEFAULTS: WarehousePermissions = {
    canViewOrders: true, canQuoteOrders: false, canShipOrders: false,
    canViewCatalog: true, canEditCatalog: false, canEditPricing: false, canImportCatalog: false,
    canViewStock: false, canReceiveStock: false, canAdjustStock: false, canWriteOffStock: false,
    canViewCustomers: true, canEditCustomerTerms: false, canViewFinance: true, canRecordPayment: true,
    // المحاسب مرآة الاتجاه الدائن لصلاحيته على الذمم المدينة (canRecordPayment):
    // يرى المشتريات ويسدّد للمورّد، لكن لا يُنشئ فواتير شراء (ذلك عمل من
    // يستلم البضاعة فعلياً — OWNER/MANAGER/INVENTORY).
    canViewPurchases: true, canCreatePurchase: false, canPaySupplier: true,
    canViewReports: true, canManageUsers: false, canChangeSettings: false,
    // المحاسب يرى أداء المندوبين وعمولاتهم المالية (canViewReps) لكن لا يدير
    // شؤونهم التشغيلية (canManageReps) ولا يبيع ميدانياً بنفسه (canSellField).
    canViewReps: true, canManageReps: false, canSellField: false,
};

/**
 * الأدوار "الحقيقية" التي تُعامَل كمعروفة عند القراءة — أي شيء آخر (null,
 * undefined, نص فارغ, دور غريب/تالف) يفشل مغلقاً (fail closed) في
 * getWarehousePermissions أدناه: يُرجَع كائن بلا أي صلاحية، وتُتجاهَل أي
 * تخصيصات JSON محفوظة بالكامل معه — انظر التعليق هناك لسبب تجاهل التخصيص لا
 * الاكتفاء بإرجاع كائن فارغ.
 */
const RECOGNIZED_TYPES = new Set(['OWNER', 'MANAGER', 'SALES', 'INVENTORY', 'ACCOUNTANT', 'STAFF']);

/**
 * افتراضيات الدور فقط، بلا أي تخصيص JSON فوقها. يطابق getDefaultPermissions
 * في app/lib/permissions.ts بنيةً وسلوكاً، بفارقين متعمّدين:
 *   - STAFF (دور قديم، انظر تعليق enum WarehouseUserType في schema.prisma)
 *     يُعامَل كمرادف تام لـ SALES — نفس الكائن حرفياً، وليس مجرد "قريب منه".
 *   - أي شيء آخر غير معروف (null/undefined/فارغ/دور تالف) يُرجِع كائناً بلا
 *     أي صلاحية فعّالة (fail closed) — لا يوجد "افتراضي متساهل" هنا إطلاقاً،
 *     بخلاف الخطأ الذي كان قائماً في permissions.ts (انظر تعليق `default`
 *     هناك) قبل إصلاحه ضمن هذه المرحلة أيضاً.
 */
export function getWarehouseDefaultPermissions(userType: string | null | undefined): WarehousePermissions {
    switch (userType) {
        case 'OWNER': return { ...OWNER_DEFAULTS };
        case 'MANAGER': return { ...MANAGER_DEFAULTS };
        case 'SALES': return { ...SALES_DEFAULTS };
        case 'INVENTORY': return { ...INVENTORY_DEFAULTS };
        case 'ACCOUNTANT': return { ...ACCOUNTANT_DEFAULTS };
        case 'STAFF': return { ...SALES_DEFAULTS };
        default: return { ...ALL_FALSE };
    }
}

/**
 * افتراضيات الدور + تخصيصات JSON الفردية المحفوظة في User.permissions —
 * معادل getUserPermissions في app/lib/permissions.ts بالضبط.
 *
 * قرار تصميم صريح ومُختبَر (انظر warehouse-permissions.test.ts): **التخصيصات
 * لا تُقيَّد بسقف الدور** — بالضبط كما تفعل app/ui/users/permissions-editor.tsx
 * على جانب الصيدلية اليوم (تحسب فرق التخصيص عن getDefaultPermissions(role)
 * وتدمجه بـ spread عادي بلا أي سقف). مالك مذخر يمنح مندوب مبيعات موثوقاً به
 * تحديداً صلاحية canRecordPayment (لأنه هو من يحصّل نقداً عند التسليم فعلياً)
 * طلب مشروع وشائع بما يكفي ليستحق تخصيصاً فردياً بدل اختراع دور ACCOUNTANT
 * وهمي له لا يملك بقية صلاحياته. السقف الذي **يبقى قائماً فعلاً** هو أن يكون
 * warehouseUserType نفسه دوراً معروفاً حقيقياً بالأساس — انظر الفحص أدناه.
 *
 * تعامل صريح مع تقاطع "فشل مغلق" × "تخصيص بلا سقف": لو كان الدور نفسه غير
 * معروف (null/فارغ/تالف)، فإن getWarehouseDefaultPermissions أعلاه يُرجِع
 * بالفعل كائناً بلا أي صلاحية — لكن لو تسرّب هذا الفحص فقط، فصف مستخدم
 * warehouseUserType فيه null مع permissions تحمل '{"canManageUsers":true}'
 * كان سيحصل فعلياً على canManageUsers=true عبر الدمج (spread) رغم أن الدور
 * غير صالح أصلاً — وهذا ليس "فشلاً مغلقاً" بأي معنى حقيقي. لذا: التخصيص
 * (permissions) لا يُقرأ أو يُطبَّق إطلاقاً إلا إذا كان warehouseUserType
 * دوراً معروفاً بالفعل (RECOGNIZED_TYPES) — دور غير معروف يعني تجاهل عمود
 * permissions بالكامل، لا مجرد تجاهل مفاتيحه.
 */
export function getWarehousePermissions(
    user: { warehouseUserType?: string | null; permissions?: string | null }
): WarehousePermissions {
    const defaults = getWarehouseDefaultPermissions(user?.warehouseUserType);

    if (!RECOGNIZED_TYPES.has(user?.warehouseUserType ?? '')) {
        // فشل مغلق يشمل التخصيص أيضاً — انظر تعليق الدالة أعلاه.
        return defaults;
    }

    if (!user.permissions) return defaults;

    try {
        const parsed: unknown = JSON.parse(user.permissions);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return defaults;
        }

        // قائمة بيضاء صريحة: فقط مفاتيح معروفة بقيمة boolean فعلية تُقبَل —
        // مفتاح تالف ({"canManageUsers":"yes"}) أو مفتاح غريب غير موجود في
        // الواجهة لا يمكن أن يتسرّب عبر الـ spread أدناه.
        const overrides: Partial<WarehousePermissions> = {};
        const raw = parsed as Record<string, unknown>;
        for (const key of ALL_PERMISSION_KEYS) {
            const value = raw[key];
            if (typeof value === 'boolean') {
                overrides[key] = value;
            }
        }

        return { ...defaults, ...overrides };
    } catch {
        // JSON تالف — نفس سلوك getUserPermissions: العودة للافتراضي بصمت، لا رمي.
        return defaults;
    }
}

export function hasWarehousePermission(
    user: { warehouseUserType?: string | null; permissions?: string | null },
    key: keyof WarehousePermissions
): boolean {
    return getWarehousePermissions(user)[key];
}

/**
 * وصف/بيانات إضافية لكل صلاحية — تغذّي لوحة تحرير الصلاحيات في
 * app/warehouse/users/UsersClient.tsx (المهمة: "أيّ صفحات وإجراءات سيحصل
 * عليها المستخدم فعلياً؟"). لا تُغيّر أي سلوك فعلي — مجرّد بيانات عرض:
 *
 *   - description: جملة عربية واحدة تقول ماذا يستطيع المستخدم أن *يفعل*
 *     فعلياً، لا إعادة صياغة للتسمية. مهم: صلاحيات "العرض" (canView*) تفتح
 *     صفحة فعلاً؛ صلاحيات "الإجراء" لا تفتح أي صفحة بنفسها (الصفحة التي
 *     تعمل عليها محروسة بصلاحية عرض منفصلة، انظر requiresPermission)، لذا لا
 *     تصف أي وصف إجراء بأنه "يفتح صفحة X" — canChangeSettings تحديداً لا
 *     تفتح شيئاً: /warehouse/settings متاحة للجميع أصلاً (انظر WAREHOUSE_PAGES).
 *   - unlocksPage: لصلاحيات العرض السبع التي تتحكم بظهور تبويب في التنقّل
 *     (تُطابق حقل requires في WAREHOUSE_PAGES أدناه حرفياً) — اسم الصفحة أو
 *     الصفحات (canViewOrders يفتح صفحتين: الطلبات والإرجاعات معاً).
 *   - requiresPermission: لصلاحيات الإجراء فقط — صلاحية العرض التي تحرس
 *     الصفحة التي يعمل عليها هذا الإجراء (من الجدول الموثَّق في مواصفة هذه
 *     المهمة، ومطابقة لحراسة كل app/warehouse/<page>/page.tsx فعلياً).
 *     تُستخدَم في ineffectivePermissions أدناه لبناء تحذير "بلا أثر".
 *   - sensitive: صلاحيات ذات أثر تجاري أو إتلافي — علامة تنبّه المالك قبل
 *     المنح، لا أكثر.
 */
export const WAREHOUSE_PERMISSION_LABELS: Record<keyof WarehousePermissions, {
    label: string;
    category: string;
    description: string;
    unlocksPage?: string[];
    requiresPermission?: keyof WarehousePermissions;
    sensitive?: boolean;
}> = {
    canViewOrders: {
        label: 'عرض الطلبات', category: 'الطلبات',
        description: 'فتح صفحتَي الطلبات والإرجاعات ومتابعة الطلبات الواردة من الصيدليات.',
        unlocksPage: ['الطلبات', 'الإرجاعات'],
    },
    canQuoteOrders: {
        label: 'تسعير ومراجعة الطلبات', category: 'الطلبات',
        description: 'تسعير أصناف الطلب ومراجعتها قبل اعتمادها للشحن.',
        requiresPermission: 'canViewOrders',
    },
    canShipOrders: {
        label: 'شحن وتسليم الطلبات', category: 'الطلبات',
        description: 'تأكيد شحن الطلب وتسجيل تسليمه للصيدلية.',
        requiresPermission: 'canViewOrders',
    },
    canViewCatalog: {
        label: 'عرض الكتالوج', category: 'الكتالوج والأسعار',
        description: 'فتح صفحة أدويتي ورؤية كامل قائمة الأصناف المعروضة للصيدليات.',
        // المرحلة 4: تفتح أيضاً "الملصقات" (طباعة الباركود) — نفس الصلاحية، لا
        // صلاحية عرض منفصلة (انظر WAREHOUSE_PAGES).
        unlocksPage: ['أدويتي', 'الملصقات'],
    },
    canEditCatalog: {
        label: 'إضافة/حذف أصناف الكتالوج', category: 'الكتالوج والأسعار',
        description: 'إضافة أصناف جديدة إلى الكتالوج أو حذف أصناف موجودة منه.',
        requiresPermission: 'canViewCatalog',
    },
    canEditPricing: {
        label: 'تغيير الأسعار', category: 'الكتالوج والأسعار',
        description: 'تغيير سعر بيع أي صنف في الكتالوج.',
        requiresPermission: 'canViewCatalog',
        sensitive: true,
    },
    canImportCatalog: {
        label: 'استيراد الكتالوج', category: 'الكتالوج والأسعار',
        description: 'استيراد قائمة أصناف دفعة واحدة من ملف بدل إدخالها يدوياً واحداً واحداً.',
        requiresPermission: 'canViewCatalog',
    },
    canViewStock: {
        label: 'عرض المخزون', category: 'المخزون',
        description: 'فتح صفحة المخزون ورؤية الدفعات والكميات المتوفرة فعلياً.',
        unlocksPage: ['المخزون'],
    },
    canReceiveStock: {
        label: 'تسجيل استلام دفعة', category: 'المخزون',
        description: 'تسجيل دفعة واردة جديدة إلى المخزون.',
        requiresPermission: 'canViewStock',
    },
    canAdjustStock: {
        label: 'تصحيح جرد المخزون', category: 'المخزون',
        description: 'تصحيح كمية صنف في المخزون بعد جرد فعلي يكشف فرقاً.',
        requiresPermission: 'canViewStock',
    },
    canWriteOffStock: {
        label: 'إتلاف المخزون', category: 'المخزون',
        description: 'شطب كميات تالفة أو منتهية الصلاحية من المخزون نهائياً.',
        requiresPermission: 'canViewStock',
        sensitive: true,
    },
    canViewCustomers: {
        label: 'عرض العملاء', category: 'العملاء والحسابات',
        description: 'فتح صفحة العملاء ورؤية قائمة الصيدليات المتعاملة مع المذخر.',
        unlocksPage: ['العملاء'],
    },
    canEditCustomerTerms: {
        label: 'تعديل شروط التعامل مع العملاء', category: 'العملاء والحسابات',
        description: 'تعديل حد الائتمان أو مهلة السداد لصيدلية، أو إيقاف تعاملها.',
        requiresPermission: 'canViewCustomers',
    },
    canViewFinance: {
        label: 'عرض الوضع المالي', category: 'العملاء والحسابات',
        description: 'فتح صفحة الحسابات ورؤية أرصدة الصيدليات وكشوف حساباتها.',
        unlocksPage: ['الحسابات'],
        sensitive: true,
    },
    canRecordPayment: {
        label: 'تسجيل دفعة سداد', category: 'العملاء والحسابات',
        description: 'تسجيل دفعة سداد وردت من صيدلية وخصمها من رصيدها المدين.',
        requiresPermission: 'canViewFinance',
        sensitive: true,
    },
    canViewPurchases: {
        label: 'عرض المشتريات', category: 'المشتريات',
        description: 'فتح صفحة المشتريات ورؤية فواتير الشراء من الموردين وذمم المذخر الدائنة.',
        unlocksPage: ['المشتريات'],
    },
    canCreatePurchase: {
        label: 'تسجيل فاتورة شراء', category: 'المشتريات',
        description: 'تسجيل فاتورة شراء جديدة من مورّد وإدخال بنودها إلى المخزون مباشرة.',
        requiresPermission: 'canViewPurchases',
        sensitive: true,
    },
    canPaySupplier: {
        label: 'تسجيل دفعة لمورّد', category: 'المشتريات',
        description: 'تسجيل دفعة سداد صادرة من المذخر لمورّد وخصمها من الذمم الدائنة.',
        requiresPermission: 'canViewPurchases',
        sensitive: true,
    },
    canViewReports: {
        label: 'عرض التقارير', category: 'إدارة',
        description: 'فتح صفحة التقارير والاطلاع على أداء المبيعات والمخزون والذمم.',
        unlocksPage: ['التقارير'],
    },
    canManageUsers: {
        label: 'إدارة المستخدمين', category: 'إدارة',
        description: 'فتح صفحة المستخدمين وإضافة حسابات موظفين أو تعديل صلاحياتهم.',
        unlocksPage: ['المستخدمون'],
        sensitive: true,
    },
    canChangeSettings: {
        label: 'تغيير الإعدادات', category: 'إدارة',
        // ملاحظة مهمة: /warehouse/settings مفتوحة للجميع أصلاً (بلا requires في
        // WAREHOUSE_PAGES) — هذه الصلاحية تتحكم فقط بالقدرة على حفظ تعديل
        // فيها، لا بفتحها؛ لذا عمداً بلا unlocksPage ولا وصف "فتح صفحة".
        description: 'حفظ تعديلات على بيانات المذخر العامة في صفحة الإعدادات.',
    },
    canViewReps: {
        label: 'عرض المندوبين', category: 'المندوبون',
        description: 'فتح صفحة المندوبين ورؤية بضاعة سيارة كل مندوب ومبيعاته وعمولته.',
        unlocksPage: ['المندوبون'],
    },
    canManageReps: {
        label: 'إدارة المندوبين', category: 'المندوبون',
        description: 'إنشاء مندوب جديد، تحميل بضاعة سيارته من المخزون الرئيسي، وضبط نسبة عمولته.',
        requiresPermission: 'canViewReps',
        sensitive: true,
    },
    canSellField: {
        label: 'بيع ميداني وتحصيل', category: 'المندوبون',
        description: 'تسجيل فاتورة بيع ميدانية من بضاعة مندوب، وتسجيل تحصيل نقدي منه.',
        requiresPermission: 'canViewReps',
    },
};

/**
 * مصدر الحقيقة الوحيد لخريطة "صفحة ← صلاحية العرض التي تحرسها" — يُستهلَك من
 * موضعين يجب ألا ينحرفا عن بعضهما أبداً: تبويبات app/warehouse/layout.tsx
 * (التنقّل) وaccessiblePages أدناه (لوحة الصلاحيات). التجميع البصري
 * (group) في TABS بالـ layout يبقى محلياً هناك — هذا الثابت يحمل فقط الثلاثي
 * href/label/requires، بنفس الترتيب الذي كان مكتوباً يدوياً في TABS.
 *
 * `as const satisfies` (بدل تعليق نوع صريح موسَّع) عمداً: يحافظ على حرفية كل
 * href كنوع أدبي (literal)، فيصبح بالإمكان في layout.tsx بناء خريطة تجميع
 * بصري (TAB_GROUP) بمفاتيح Record<href, ...> يفشل بناؤها (compile error) إن
 * أُضيفت/حُذفت صفحة هنا دون تحديثها هناك — بدل سقوط تبويب من الشريط الجانبي
 * بصمت وقت التشغيل فقط. `requires: undefined` صريح (بدل حذف الحقل) للصفحتين
 * غير المحروستين حفاظاً على شكل عنصر موحّد عبر كل الصفوف (بلا أثر على أي
 * فحص `!p.requires`، الذي يبقى صحيحاً بالضبط كما لو كان الحقل غائباً).
 */
export const WAREHOUSE_PAGES = [
    { href: '/warehouse', label: 'الرئيسية', requires: undefined },
    { href: '/warehouse/orders', label: 'الطلبات', requires: 'canViewOrders' },
    { href: '/warehouse/returns', label: 'الإرجاعات', requires: 'canViewOrders' },
    { href: '/warehouse/reps', label: 'المندوبون', requires: 'canViewReps' },
    { href: '/warehouse/catalog', label: 'أدويتي', requires: 'canViewCatalog' },
    { href: '/warehouse/stock', label: 'المخزون', requires: 'canViewStock' },
    // المرحلة 4 (طباعة الباركود والملصقات): بلا صلاحية عرض منفصلة — من يرى
    // الكتالوج يطبع ملصقاته (نفس canViewCatalog التي تفتح "أدويتي" أعلاه).
    { href: '/warehouse/labels', label: 'الملصقات', requires: 'canViewCatalog' },
    { href: '/warehouse/customers', label: 'العملاء', requires: 'canViewCustomers' },
    { href: '/warehouse/accounts', label: 'الحسابات', requires: 'canViewFinance' },
    { href: '/warehouse/purchases', label: 'المشتريات', requires: 'canViewPurchases' },
    { href: '/warehouse/reports', label: 'التقارير', requires: 'canViewReports' },
    { href: '/warehouse/users', label: 'المستخدمون', requires: 'canManageUsers' },
    { href: '/warehouse/settings', label: 'الإعدادات', requires: undefined },
] as const satisfies readonly { href: string; label: string; requires?: keyof WarehousePermissions }[];

/** الصفحات التي سيصل إليها المستخدم فعلياً بهذه الصلاحيات. */
export function accessiblePages(perms: WarehousePermissions): Array<{ href: string; label: string }> {
    return WAREHOUSE_PAGES
        .filter((p) => !p.requires || perms[p.requires])
        .map((p) => ({ href: p.href, label: p.label }));
}

/** صلاحيات مفعّلة لكنها بلا أثر لأن صلاحية عرض الصفحة غير مفعّلة. */
export function ineffectivePermissions(
    perms: WarehousePermissions
): Array<{ key: keyof WarehousePermissions; label: string; requiresLabel: string }> {
    const result: Array<{ key: keyof WarehousePermissions; label: string; requiresLabel: string }> = [];
    for (const key of ALL_PERMISSION_KEYS) {
        const meta = WAREHOUSE_PERMISSION_LABELS[key];
        const requires = meta.requiresPermission;
        if (requires && perms[key] && !perms[requires]) {
            result.push({ key, label: meta.label, requiresLabel: WAREHOUSE_PERMISSION_LABELS[requires].label });
        }
    }
    return result;
}

/** تسميات عربية لأدوار مستخدمي المذخر — للعرض في الواجهة فقط. */
export const WAREHOUSE_ROLE_LABELS: Record<string, string> = {
    OWNER: 'مالك',
    MANAGER: 'مدير',
    SALES: 'مندوب مبيعات',
    INVENTORY: 'مسؤول مخزون',
    ACCOUNTANT: 'محاسب',
    // دور قديم — انظر تعليق enum WarehouseUserType في schema.prisma.
    STAFF: 'موظف (قديم)',
};
