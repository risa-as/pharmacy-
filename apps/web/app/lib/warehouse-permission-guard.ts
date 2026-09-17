/**
 * warehouse-permission-guard.ts
 *
 * Phase 3 (الأدوار والصلاحيات) من نظام المذاخر B2B: البوابة المشتركة الوحيدة
 * لكل مسارات app/api/warehouse-portal/* — تستبدل requireOwnerActor() الذي
 * كان مكرَّراً بنفس المنطق تقريباً في أربعة ملفات (users, stock/adjust,
 * customers/[id], invoices/[id]/payments) بفحص صلاحية دقيق حسب الدور.
 *
 * غير نقيّة عمداً (تستورد Prisma وnext/server) — بخلاف
 * app/lib/warehouse-permissions.ts الذي يبقى نقياً بالكامل كي يُختبَر وحدوياً
 * تحت إعداد vitest في هذا المستودع (الذي لا يحل alias "@/*"). فصل الملفين هو
 * نفس فلسفة "نقي مقابل غير نقي" المتّبعة في كل وحدات هذه الميزة (انظر تعليق
 * الرأس في app/lib/warehouse-users.ts وapp/lib/warehouse-context.ts).
 *
 * حرِج: يستعلم دائماً عن الفاعل من قاعدة البيانات مباشرة (وليس من الجلسة) —
 * warehouseUserType وpermissions ليسا ضمن جلسة NextAuth أصلاً (انظر
 * warehouse-context.ts)، فتخفيض دور مستخدم أو سحب صلاحية منه أو إيقاف حسابه
 * ينفذ فوراً في الطلب التالي، لا بعد انتهاء صلاحية الجلسة/تسجيل الدخول من
 * جديد.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import {
    getWarehousePermissions,
    hasWarehousePermission,
    WAREHOUSE_PERMISSION_LABELS,
    type WarehousePermissions,
} from '@/app/lib/warehouse-permissions';

/** الشكل المُستعلَم فعلياً من صف User — يكفي لحساب الصلاحيات الفعلية للفاعل. */
export interface WarehouseActorRow {
    id: string;
    warehouseId: string | null;
    warehouseUserType: string | null;
    permissions: string | null;
    isActive: boolean;
}

export type RequireWarehousePermissionResult =
    | { ok: true; actor: WarehouseActorRow }
    | { ok: false; response: NextResponse };

/**
 * البوابة المشتركة: تستعلم عن الفاعل من قاعدة البيانات، تتحقق أنه فعّال
 * وتابع فعلاً لمذخر السياق (نفس خط الدفاع الإضافي الذي كان في
 * requireOwnerActor)، ثم تتحقق من كل مفتاح صلاحية مطلوب.
 *
 * `key` قد تكون مفتاحاً واحداً أو مصفوفة مفاتيح — مصفوفة تعني "الكل مطلوب"
 * (AND)، وتُرجِع 403 يسمّي أول صلاحية ناقصة. هذا يغطي حالات مثل تعديل كتالوج
 * حيث يحمل جسم طلب PATCH واحد حقل سعر وحقل توفر معاً، وكل حقل يتطلب صلاحية
 * مختلفة (canEditPricing وcanEditCatalog على التوالي) — استعلام واحد فقط عن
 * قاعدة البيانات (findUnique) يكفي دائماً، مهما كان عدد المفاتيح المطلوبة.
 *
 * يُعيد `actor` عند النجاح كي تستطيع مسارات مثل stock/adjust (حيث يُحسَم
 * المفتاح المطلوب فعلياً بعد قراءة الجسم — ADJUSTMENT مقابل DAMAGE) أو
 * catalog POST (حيث سعر مختلف عن صنف موجود يتطلب فحصاً إضافياً شرطياً
 * لـ canEditPricing) إعادة استخدام hasWarehousePermission(actor, key) مباشرة
 * بلا استعلام ثانٍ عن قاعدة البيانات.
 */
export async function requireWarehousePermission(
    ctx: { warehouseId: string; user: { id: string } },
    key: keyof WarehousePermissions | (keyof WarehousePermissions)[]
): Promise<RequireWarehousePermissionResult> {
    const actor = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { id: true, warehouseId: true, warehouseUserType: true, permissions: true, isActive: true },
    });

    if (!actor || actor.warehouseId !== ctx.warehouseId || actor.isActive === false) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'حسابك غير مفعّل ضمن هذا المذخر أو لا يتبع له.' },
                { status: 403 }
            ),
        };
    }

    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
        if (!hasWarehousePermission(actor, k)) {
            const label = WAREHOUSE_PERMISSION_LABELS[k]?.label ?? k;
            return {
                ok: false,
                response: NextResponse.json(
                    { error: `لا تملك صلاحية "${label}" اللازمة لتنفيذ هذه العملية.` },
                    { status: 403 }
                ),
            };
        }
    }

    return { ok: true, actor };
}

/** يستخدمها من يحتاج فحص صلاحية إضافياً شرطياً على actor مُستعلَم مسبقاً بلا استعلام ثانٍ. */
export { getWarehousePermissions, hasWarehousePermission };
