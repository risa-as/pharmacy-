"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { changeableByTenant, ownerForNewRow } from "@/app/lib/tenant-owned";


// Schema for discount validation
const DiscountSchema = z.object({
    name: z.string().min(1, "اسم العرض مطلوب"),
    code: z.string().optional(),
    type: z.enum(["PERCENTAGE", "FIXED"]),
    value: z.coerce.number().min(0, "القيمة يجب أن تكون موجبة"),
    minPurchase: z.coerce.number().min(0).optional(),
    maxDiscount: z.coerce.number().min(0).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isActive: z.boolean().default(true),
    applyToAll: z.boolean().default(false),
});

// Create a new discount
export async function createDiscount(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canApplyDiscount) return { message: "ليس لديك صلاحية لإدارة العروض." };

    const validatedFields = DiscountSchema.safeParse({
        name: formData.get("name"),
        code: formData.get("code") || undefined,
        type: formData.get("type"),
        value: formData.get("value"),
        minPurchase: formData.get("minPurchase") || 0,
        maxDiscount: formData.get("maxDiscount") || undefined,
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        isActive: formData.get("isActive") === "on",
        applyToAll: formData.get("applyToAll") === "on",
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const data = validatedFields.data;

    // Get drug IDs if specific drugs are selected
    const drugIdsStr = formData.get("drugIds") as string;
    const drugIds = drugIdsStr ? drugIdsStr.split(",").filter(Boolean) : [];

    try {
        await prisma.discount.create({
            data: {
                name: data.name,
                code: data.code || null,
                type: data.type,
                value: data.value,
                minPurchase: data.minPurchase || 0,
                maxDiscount: data.maxDiscount || null,
                startDate: data.startDate,
                endDate: data.endDate,
                isActive: data.isActive,
                applyToAll: data.applyToAll,
                drugIds: drugIds.length > 0 ? drugIds : [],
                // N20: owned by the creating organisation, never shared implicitly.
                organizationId: ownerForNewRow(tenantCtx),
            },
        });
    } catch (error) {
        console.error("Create Discount Error:", error);
        return { message: "حدث خطأ أثناء إنشاء العرض" };
    }

    revalidatePath("/dashboard/discounts");
    redirect("/dashboard/discounts");
}

// Update discount
export async function updateDiscount(id: string, prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canApplyDiscount) return { message: "ليس لديك صلاحية لإدارة العروض." };
    // N20: only the owning organisation (or SUPER_ADMIN for legacy rows) may change it.
    const owned = await prisma.discount.findUnique({ where: { id }, select: { organizationId: true } });
    if (!changeableByTenant(tenantCtx, owned)) return { message: "غير مصرح: العرض ليس تابعاً لمؤسستك." };

    const validatedFields = DiscountSchema.safeParse({
        name: formData.get("name"),
        code: formData.get("code") || undefined,
        type: formData.get("type"),
        value: formData.get("value"),
        minPurchase: formData.get("minPurchase") || 0,
        maxDiscount: formData.get("maxDiscount") || undefined,
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate"),
        isActive: formData.get("isActive") === "on",
        applyToAll: formData.get("applyToAll") === "on",
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const data = validatedFields.data;
    const drugIdsStr = formData.get("drugIds") as string;
    const drugIds = drugIdsStr ? drugIdsStr.split(",").filter(Boolean) : [];

    try {
        await prisma.discount.update({
            where: { id },
            data: {
                name: data.name,
                code: data.code || null,
                type: data.type,
                value: data.value,
                minPurchase: data.minPurchase || 0,
                maxDiscount: data.maxDiscount || null,
                startDate: data.startDate,
                endDate: data.endDate,
                isActive: data.isActive,
                applyToAll: data.applyToAll,
                drugIds: drugIds.length > 0 ? drugIds : [],
            },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء تحديث العرض" };
    }

    revalidatePath("/dashboard/discounts");
    redirect("/dashboard/discounts");
}

// Delete discount
export async function deleteDiscount(id: string) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canApplyDiscount) return { message: "ليس لديك صلاحية لإدارة العروض." };
    const owned = await prisma.discount.findUnique({ where: { id }, select: { organizationId: true } });
    if (!changeableByTenant(tenantCtx, owned)) return { message: "غير مصرح: العرض ليس تابعاً لمؤسستك." };

    try {
        await prisma.discount.delete({
            where: { id },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف العرض" };
    }

    revalidatePath("/dashboard/discounts");
}
