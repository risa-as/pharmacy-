"use server";

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

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

    const { barcode, tradeName, scientificName, origin, isActive } = validatedFields.data;

    try {
        await prisma.globalDrug.create({
            data: {
                barcode,
                tradeName,
                scientificName,
                origin: origin || null,
                isActive: isActive || true,
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
    try {
        // Check if drug has sales
        const drugWithSales = await prisma.globalDrug.findUnique({
            where: { id },
            include: { _count: { select: { saleItems: true } } }
        });

        if (drugWithSales && drugWithSales._count.saleItems > 0) {
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

    const { barcode, tradeName, scientificName, origin, isActive } = validatedFields.data;

    try {
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
