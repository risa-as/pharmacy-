import { Prisma } from '@prisma/client';
"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { logAudit } from "@/app/lib/audit";


const DrugSchema = z.object({
    id: z.string(),
    barcode: z.string().min(1, "الباركود مطلوب"),
    tradeName: z.string().min(1, "الاسم التجاري مطلوب"),
    scientificName: z.string().min(1, "الاسم العلمي مطلوب"),
    origin: z.string().optional(),
    // image: z.string().optional(), // Handle image upload later
    isActive: z.boolean().optional(),
});

const CreateDrug = DrugSchema.omit({ id: true });
const UpdateDrug = DrugSchema;

export async function createDrug(prevState: any, formData: FormData) {
    const validatedFields = CreateDrug.safeParse({
        barcode: formData.get("barcode"),
        tradeName: formData.get("tradeName"),
        scientificName: formData.get("scientificName"),
        origin: formData.get("origin"),
        isActive: formData.get("isActive") === "on",
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "يرجى ملء جميع الحقول المطلوبة.",
        };
    }

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) {
        return { message: "غير مصرح لك بإضافة دواء." };
    }

    const { barcode, tradeName, scientificName, origin, isActive } = validatedFields.data;

    try {
        const newDrug = await prisma.globalDrug.create({
            data: {
                barcode,
                tradeName,
                scientificName,
                origin: origin || null,
                isActive: isActive ?? true,
                organizationId: tenantCtx.organizationId,
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'DRUG',
            entityId: newDrug.id,
            details: JSON.stringify({ barcode, tradeName, scientificName }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return { message: "الباركود موجود مسبقاً. يرجى استخدام باركود مختلف." };
        }
        return {
            message: "حدث خطأ أثناء إضافة الدواء. يرجى المحاولة مرة أخرى.",
        };
    }

    revalidatePath("/dashboard/drugs");
    redirect("/dashboard/drugs");
}

export async function deleteDrug(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) {
        return { message: "غير مصرح لك بحذف الأدوية." };
    }

    try {
        const isSuperAdmin = tenantCtx.user.role === 'SUPER_ADMIN';

        // Global drugs (organizationId: null) can only be deleted by SUPER_ADMIN
        const drug = await prisma.globalDrug.findFirst({
            where: isSuperAdmin
                ? { id }
                : { id, organizationId: tenantCtx.organizationId },
            include: { _count: { select: { saleItems: true } } }
        });

        if (!drug) {
            return { message: "لا يمكنك حذف هذا الدواء. الأدوية العالمية يمكن حذفها من قبل المشرف العام فقط." };
        }

        if (drug._count.saleItems > 0) {
            return { message: "لا يمكن حذف الدواء لأنه مرتبط بعمليات بيع سابقة. يمكنك إلغاء تفعيله بدلاً من ذلك." };
        }

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // Delete associated inventory items first
            await tx.inventory.deleteMany({
                where: { drugId: id }
            });

            // Delete the drug
            await tx.globalDrug.delete({
                where: { id },
            });
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'DELETE',
            entity: 'DRUG',
            entityId: id,
            details: JSON.stringify({ tradeName: drug.tradeName }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });

        revalidatePath("/dashboard/drugs");
        return { message: "تم حذف الدواء بنجاح" };
    } catch (error) {
        console.error("Delete Drug Error:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في حذف الدواء." };
    }
}

export async function updateDrug(
    id: string,
    prevState: any,
    formData: FormData
) {
    const validatedFields = DrugSchema.safeParse({
        id: id,
        barcode: formData.get("barcode"),
        tradeName: formData.get("tradeName"),
        scientificName: formData.get("scientificName"),
        origin: formData.get("origin"),
        isActive: formData.get("isActive") === "on",
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في تحديث الدواء. تحقق من الحقول.",
        };
    }

    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) {
        return { message: "غير مصرح لك بتحديث دواء." };
    }

    const { barcode, tradeName, scientificName, origin, isActive } = validatedFields.data;

    try {
        const isSuperAdmin = tenantCtx.user.role === 'SUPER_ADMIN';

        // Global drugs (organizationId: null) are read-only for all orgs — only SUPER_ADMIN can edit them
        const existingDrug = await prisma.globalDrug.findFirst({
            where: isSuperAdmin
                ? { id }
                : { id, organizationId: tenantCtx.organizationId },
        });

        if (!existingDrug) {
            // Check if it's a global drug to give a clearer error
            const isGlobal = await prisma.globalDrug.findFirst({ where: { id, organizationId: null } });
            if (isGlobal) {
                return { message: "هذا الدواء عالمي ويُدار من قبل المشرف العام فقط. يمكنك استخدامه في المخزون لكن لا يمكنك تعديله." };
            }
            return { message: "لا يمكنك تعديل هذا الدواء لأنه لا يخص مؤسستك." };
        }

        await prisma.globalDrug.update({
            where: { id },
            data: {
                barcode,
                tradeName,
                scientificName,
                origin: origin || null,
                isActive: isActive ?? true,
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'DRUG',
            entityId: id,
            details: JSON.stringify({ barcode, tradeName, scientificName, isActive }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return { message: "الباركود موجود مسبقاً." };
        }
        return { message: "خطأ في قاعدة البيانات: فشل في تحديث الدواء." };
    }

    revalidatePath("/dashboard/drugs");
    redirect("/dashboard/drugs");
}

export async function getDrugById(id: string) {
    return await prisma.globalDrug.findUnique({
        where: { id },
    });
}

// ── Admin-specific variants that redirect to /dashboard/admin/drugs ──────────

export async function createGlobalDrug(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (tenantCtx.user.role !== 'SUPER_ADMIN') return { message: "هذا الإجراء للمشرف العام فقط." };

    const validatedFields = CreateDrug.safeParse({
        barcode: formData.get("barcode"),
        tradeName: formData.get("tradeName"),
        scientificName: formData.get("scientificName"),
        origin: formData.get("origin"),
        isActive: formData.get("isActive") === "on",
    });

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: "يرجى ملء جميع الحقول المطلوبة." };
    }

    const { barcode, tradeName, scientificName, origin, isActive } = validatedFields.data;

    try {
        const newDrug = await prisma.globalDrug.create({
            data: { barcode, tradeName, scientificName, origin: origin || null, isActive: isActive ?? true, organizationId: null },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE', entity: 'DRUG', entityId: newDrug.id,
            details: JSON.stringify({ barcode, tradeName, global: true }),
        });
    } catch (error: any) {
        if (error.code === 'P2002') return { message: "الباركود موجود مسبقاً." };
        return { message: "حدث خطأ أثناء إضافة الدواء." };
    }

    revalidatePath("/dashboard/admin/drugs");
    redirect("/dashboard/admin/drugs");
}

export async function updateGlobalDrug(id: string, prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (tenantCtx.user.role !== 'SUPER_ADMIN') return { message: "هذا الإجراء للمشرف العام فقط." };

    const validatedFields = DrugSchema.safeParse({
        id,
        barcode: formData.get("barcode"),
        tradeName: formData.get("tradeName"),
        scientificName: formData.get("scientificName"),
        origin: formData.get("origin"),
        isActive: formData.get("isActive") === "on",
    });

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: "فشل في تحديث الدواء. تحقق من الحقول." };
    }

    const { barcode, tradeName, scientificName, origin, isActive } = validatedFields.data;

    try {
        await prisma.globalDrug.update({
            where: { id },
            data: { barcode, tradeName, scientificName, origin: origin || null, isActive: isActive ?? true },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE', entity: 'DRUG', entityId: id,
            details: JSON.stringify({ barcode, tradeName, global: true }),
        });
    } catch (error: any) {
        if (error.code === 'P2002') return { message: "الباركود موجود مسبقاً." };
        return { message: "خطأ في قاعدة البيانات: فشل في تحديث الدواء." };
    }

    revalidatePath("/dashboard/admin/drugs");
    redirect("/dashboard/admin/drugs");
}
