"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


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
        await prisma.globalDrug.create({
            data: {
                barcode,
                tradeName,
                scientificName,
                origin: origin || null,
                isActive: isActive ?? true,
                organizationId: tenantCtx.organizationId,
            },
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
        // Enforce tenant isolation and check if drug has sales
        const drug = await prisma.globalDrug.findFirst({
            where: {
                id,
                organizationId: tenantCtx.organizationId
            },
            include: { _count: { select: { saleItems: true } } }
        });

        if (!drug) {
            return { message: "لا يمكنك حذف هذا الدواء (عالمي أو لا يخص مؤسستك)." };
        }

        if (drug._count.saleItems > 0) {
            return { message: "لا يمكن حذف الدواء لأنه مرتبط بعمليات بيع سابقة. يمكنك إلغاء تفعيله بدلاً من ذلك." };
        }

        await prisma.$transaction(async (tx) => {
            // Delete associated inventory items first
            await tx.inventory.deleteMany({
                where: { drugId: id }
            });

            // Delete the drug
            await tx.globalDrug.delete({
                where: { id },
            });
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
        // Only allow updating if it belongs to the organization
        const existingDrug = await prisma.globalDrug.findFirst({
            where: { id, organizationId: tenantCtx.organizationId }
        });

        if (!existingDrug) {
            return { message: "لا يمكنك تعديل هذا الدواء لأنه دواء عالمي أو لا يخص مؤسستك." };
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
