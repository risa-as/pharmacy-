"use server";

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

const InventorySchema = z.object({
    id: z.string(),
    branchId: z.string().min(1, "الفرع مطلوب"),
    drugId: z.string().min(1, "الدواء مطلوب"),
    price: z.coerce.number().min(0, "السعر يجب أن يكون موجباً"),
    cost: z.coerce.number().min(0, "التكلفة يجب أن تكون موجبة"),
    minStock: z.coerce.number().int().min(0).default(0),
    maxStock: z.coerce.number().int().min(1).default(1000),
});

const CreateInventory = InventorySchema.omit({ id: true });

export async function createInventory(prevState: any, formData: FormData) {
    const validatedFields = CreateInventory.safeParse({
        branchId: formData.get("branchId"),
        drugId: formData.get("drugId"),
        price: formData.get("price"),
        cost: formData.get("cost"),
        minStock: formData.get("minStock") || 0,
        maxStock: formData.get("maxStock") || 1000,
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في إضافة المخزون. تحقق من الحقول.",
        };
    }

    const { branchId, drugId, price, cost, minStock, maxStock } = validatedFields.data;

    try {
        // التحقق من عدم وجود المخزون مسبقاً
        const existingInventory = await prisma.inventory.findFirst({
            where: { branchId, drugId },
        });

        if (existingInventory) {
            return { message: "هذا الدواء موجود بالفعل في مخزون هذا الفرع." };
        }

        await prisma.inventory.create({
            data: {
                branchId,
                drugId,
                price,
                cost,
                minStock,
                maxStock,
            },
        });
    } catch (error) {
        console.error("Error creating inventory:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في إضافة المخزون." };
    }

    revalidatePath("/dashboard/inventory");
    redirect("/dashboard/inventory");
}

export async function updateInventory(
    id: string,
    prevState: any,
    formData: FormData,
) {
    const validatedFields = InventorySchema.safeParse({
        id: id,
        branchId: formData.get("branchId"),
        drugId: formData.get("drugId"),
        price: formData.get("price"),
        cost: formData.get("cost"),
        minStock: formData.get("minStock") || 0,
        maxStock: formData.get("maxStock") || 1000,
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في تحديث المخزون. تحقق من الحقول.",
        };
    }

    const { branchId, drugId, price, cost, minStock, maxStock } = validatedFields.data;

    try {
        await prisma.inventory.update({
            where: { id },
            data: { branchId, drugId, price, cost, minStock, maxStock },
        });
    } catch (error) {
        console.error("Error updating inventory:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في تحديث المخزون." };
    }

    revalidatePath("/dashboard/inventory");
    redirect("/dashboard/inventory");
}

export async function deleteInventory(id: string) {
    try {
        // حذف الدفعات أولاً
        await prisma.batch.deleteMany({
            where: { inventoryId: id },
        });

        await prisma.inventory.delete({
            where: { id },
        });
        revalidatePath("/dashboard/inventory");
    } catch (error) {
        console.error("Error deleting inventory:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في حذف المخزون." };
    }
}

// إضافة دفعة جديدة
export async function addBatch(prevState: any, formData: FormData) {
    const inventoryId = formData.get("inventoryId") as string;
    const batchNumber = formData.get("batchNumber") as string;
    const quantity = parseInt(formData.get("quantity") as string);
    const expiryDate = new Date(formData.get("expiryDate") as string);

    if (!inventoryId || !batchNumber || !quantity || !expiryDate) {
        return { message: "جميع الحقول مطلوبة." };
    }

    try {
        await prisma.batch.create({
            data: {
                inventoryId,
                batchNumber,
                quantity,
                expiryDate,
            },
        });
    } catch (error) {
        console.error("Error adding batch:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في إضافة الدفعة." };
    }

    revalidatePath("/dashboard/inventory");
    return { success: true };
}

// تحديث كمية دفعة
export async function updateBatchQuantity(batchId: string, newQuantity: number) {
    try {
        await prisma.batch.update({
            where: { id: batchId },
            data: { quantity: newQuantity },
        });
        revalidatePath("/dashboard/inventory");
    } catch (error) {
        console.error("Error updating batch:", error);
        return { message: "فشل في تحديث الدفعة." };
    }
}

// حذف دفعة
export async function deleteBatch(id: string) {
    try {
        await prisma.batch.delete({ where: { id } });
        revalidatePath("/dashboard/inventory");
    } catch (error) {
        console.error("Error deleting batch:", error);
        return { message: "فشل في حذف الدفعة." };
    }
}
