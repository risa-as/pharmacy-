"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { logAudit } from "@/app/lib/audit";


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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canAddDrug) return { message: "ليس لديك صلاحية لإضافة أدوية للمخزون." };

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

        const inv = await prisma.inventory.create({
            data: {
                branchId,
                drugId,
                price,
                cost,
                minStock,
                maxStock,
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'INVENTORY',
            entityId: inv.id,
            details: JSON.stringify({ drugId, branchId, price, cost }),
            branchId,
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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditDrug) return { message: "ليس لديك صلاحية لتعديل المخزون." };

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
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'INVENTORY',
            entityId: id,
            details: JSON.stringify({ price, cost, minStock, maxStock }),
            branchId,
        });
    } catch (error) {
        console.error("Error updating inventory:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في تحديث المخزون." };
    }

    revalidatePath("/dashboard/inventory");
    redirect("/dashboard/inventory");
}

export async function deleteInventory(id: string) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canDeleteDrug) return { message: "ليس لديك صلاحية لحذف الأدوية من المخزون." };

    try {
        // حذف الدفعات أولاً
        await prisma.batch.deleteMany({
            where: { inventoryId: id },
        });

        await prisma.inventory.delete({
            where: { id },
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'DELETE',
            entity: 'INVENTORY',
            entityId: id,
            branchId: tenantCtx.user.branchId ?? undefined,
        });

        revalidatePath("/dashboard/inventory");
    } catch (error) {
        console.error("Error deleting inventory:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في حذف المخزون." };
    }
}

function generateBatchNumber(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// إضافة دفعة جديدة
export async function addBatch(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canAddDrug) return { message: "ليس لديك صلاحية لإضافة دفعات للمخزون." };

    const inventoryId = formData.get("inventoryId") as string;
    const batchNumber = generateBatchNumber();
    const quantity = parseInt(formData.get("quantity") as string);
    const costPrice = Number(formData.get("costPrice"));
    if (!Number.isFinite(costPrice) || costPrice <= 0 || costPrice > 1000000000) return {message:"تكلفة الشراء يجب أن تكون أكبر من صفر."};
    const scopedInventory = await prisma.inventory.findFirst({where:{AND:[tenantCtx.tenantBranchWhere,{id:inventoryId}]},select:{id:true}});
    if (!scopedInventory) return {message:"المخزون خارج نطاقك."};
    const expiryDate = new Date(formData.get("expiryDate") as string);
    const supplierId = (formData.get("supplierId") as string) || null;

    if (!inventoryId || !quantity || !expiryDate) {
        return { message: "جميع الحقول مطلوبة." };
    }

    // ميزة وحدة التسعير: عدد الأشرطة في الباكيت يُثبَّت من هنا — هذه هي اللحظة
    // الوحيدة التي يكون فيها الصيدلاني ممسكاً بالعلبة فعلاً. القيمة تُحفظ على
    // الدواء (مشتركة بين كل الصيدليات بقرار صاحب النظام) مع تاريخ التأكيد، فلا
    // يُسأل عنها أحد بعد ذلك.
    const rawUnits = formData.get("unitsPerPack");
    const unitsPerPack = rawUnits === null || rawUnits === "" ? null : parseInt(String(rawUnits), 10);
    if (unitsPerPack !== null && (!Number.isInteger(unitsPerPack) || unitsPerPack <= 0)) {
        return { message: "عدد الأشرطة في الباكيت يجب أن يكون عدداً صحيحاً أكبر من صفر." };
    }

    try {
        const batch = await prisma.batch.create({
            data: {
                inventoryId,
                batchNumber,
                quantity,
                initialQuantity: quantity,
                costPrice,
                expiryDate,
                supplierId,
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'BATCH',
            entityId: batch.id,
            details: JSON.stringify({ inventoryId, batchNumber, quantity, costPrice, expiryDate }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });

        // يُكتب بعد نجاح الدفعة لا قبلها: تثبيت تعبئة دواء مشتركة بين كل
        // الصيدليات بناءً على حفظ فشل هو أسوأ من ألّا تُثبَّت أصلاً.
        //
        // النطاق شرط لا زينة: inventoryId يأتي من المتصفح، والكتابة هنا تمسّ صفاً
        // عالمياً تراه كل المؤسسات — فيُتحقَّق أن صف المخزون يخصّ مؤسسة الطالب
        // قبل أي كتابة.
        if (unitsPerPack !== null && tenantCtx.organizationId) {
            const inv = await prisma.inventory.findFirst({
                where: { id: inventoryId, branch: { organizationId: tenantCtx.organizationId } },
                select: { drugId: true },
            });
            if (inv) {
                await prisma.globalDrug.update({
                    where: { id: inv.drugId },
                    data: { unitsPerPack, unitsPerPackConfirmedAt: new Date() },
                });
            }
        }
    } catch (error) {
        console.error("Error adding batch:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في إضافة الدفعة." };
    }

    revalidatePath("/dashboard/inventory");
    return { success: true };
}

// تحديث كمية دفعة
export async function updateBatchQuantity(batchId: string, newQuantity: number) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    try {
        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            select: { quantity: true, initialQuantity: true },
        });
        if (!batch) return { message: "الدفعة غير موجودة." };

        await prisma.batch.update({
            where: { id: batchId },
            data: {
                quantity: newQuantity,
                // Manual edit is a data correction, not consumption — shift initialQuantity
                // by the same delta so consumed (initial - quantity) stays unchanged.
                initialQuantity: Math.max(newQuantity, batch.initialQuantity + (newQuantity - batch.quantity)),
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'BATCH',
            entityId: batchId,
            details: JSON.stringify({ newQuantity }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });
        revalidatePath("/dashboard/inventory");
    } catch (error) {
        console.error("Error updating batch:", error);
        return { message: "فشل في تحديث الدفعة." };
    }
}

// حذف دفعة
export async function deleteBatch(id: string) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditDrug) return { message: "ليس لديك صلاحية لحذف الدفعات." };

    try {
        await prisma.batch.delete({ where: { id } });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'DELETE',
            entity: 'BATCH',
            entityId: id,
            branchId: tenantCtx.user.branchId ?? undefined,
        });
        revalidatePath("/dashboard/inventory");
    } catch (error) {
        console.error("Error deleting batch:", error);
        return { message: "فشل في حذف الدفعة." };
    }
}
