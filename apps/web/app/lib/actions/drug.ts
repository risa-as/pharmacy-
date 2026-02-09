"use server";

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

const DrugSchema = z.object({
    id: z.string(),
    barcode: z.string().min(1, "Barcode is required"),
    tradeName: z.string().min(1, "Trade Name is required"),
    scientificName: z.string().min(1, "Scientific Name is required"),
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
            message: "Missing Fields. Failed to Create Drug.",
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
            return { message: "Barcode already exists." };
        }
        return {
            message: "Database Error: Failed to Create Drug.",
        };
    }

    revalidatePath("/dashboard/drugs");
    redirect("/dashboard/drugs");
}

export async function deleteDrug(id: string) {
    try {
        await prisma.globalDrug.delete({
            where: { id },
        });
        revalidatePath("/dashboard/drugs");
    } catch (error) {
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
