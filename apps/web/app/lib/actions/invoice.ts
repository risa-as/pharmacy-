import { Prisma } from '@prisma/client';
"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


// Dawatech-style: Full control over Batch and Pricing at entry
const PurchaseItemSchema = z.object({
    drugId: z.string(),
    quantity: z.coerce.number().int().gt(0),
    cost: z.coerce.number().gt(0), // Cost Price
    sellingPrice: z.coerce.number().gt(0), // Public Price (updates inventory)
    expiryDate: z.string(), // YYYY-MM-DD
    batchNumber: z.string().min(1, "رقم الدفعة مطلوب"),
});

const PurchaseSchema = z.object({
    supplierId: z.string(),
    branchId: z.string(),
    invoiceNumber: z.string().optional(), // External Invoice Number
    items: z.array(PurchaseItemSchema),
});

export async function createPurchase(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    const rawItems = formData.get("itemsData");
    const supplierId = formData.get("supplierId");
    const branchId = formData.get("branchId");
    const invoiceNumber = formData.get("invoiceNumber");

    if (!rawItems || !supplierId || !branchId) {
        return { message: "يرجى اختيار المورد والفرع وإضافة الأصناف." };
    }

    let items;
    try {
        items = JSON.parse(rawItems as string);
    } catch (e) {
        return { message: "صيغة بيانات الأصناف غير صحيحة." };
    }

    // Validate structure
    // Note: z.array(PurchaseItemSchema).safeParse(items)
    const itemsValidation = z.array(PurchaseItemSchema).safeParse(items);

    if (!itemsValidation.success) {
        console.error(itemsValidation.error);
        return { message: "بيانات الأصناف غير صحيحة. يرجى مراجعة الكميات والأسعار والتواريخ." };
    }

    const validItems = itemsValidation.data;
    const total = validItems.reduce((acc: any, item: any) => acc + (item.quantity * item.cost), 0);

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Create Purchase Record
            const purchase = await tx.purchase.create({
                data: {
                    supplierId: supplierId as string,
                    branchId: branchId as string,
                    total,
                    status: "COMPLETED",
                    // invoiceNumber: invoiceNumber // Needs schema update if we want to store external Inv#
                    items: {
                        create: validItems.map((item: any) => ({
                            drugId: item.drugId,
                            quantity: item.quantity,
                            cost: item.cost,
                            expiryDate: new Date(item.expiryDate)
                            // batchNumber: item.batchNumber // Needs schema update
                        }))
                    }
                }
            });

            // 2. Process Inventory & Batches (The Core Logic)
            for (const item of validItems) {
                // A. Upsert Inventory Record (Define Price/Cost for this Branch)
                // Check if exists first to update price
                const existingInv = await tx.inventory.findFirst({
                    where: { branchId: branchId as string, drugId: item.drugId }
                });

                let inventoryId = existingInv?.id;

                if (existingInv) {
                    // Update Selling Price to the latest one entered (Last In Protocol usually for pricing updates?)
                    // Or Keep existing? Dawatech usually updates public price if changed.
                    await tx.inventory.update({
                        where: { id: existingInv.id },
                        data: {
                            price: item.sellingPrice,
                            cost: item.cost
                        }
                    });
                } else {
                    const newInv = await tx.inventory.create({
                        data: {
                            branchId: branchId as string,
                            drugId: item.drugId,
                            price: item.sellingPrice,
                            cost: item.cost
                        }
                    });
                    inventoryId = newInv.id;
                }

                // B. Create Batch (Stock Level)
                await tx.batch.create({
                    data: {
                        inventoryId: inventoryId!,
                        batchNumber: item.batchNumber,
                        expiryDate: new Date(item.expiryDate),
                        quantity: item.quantity,
                        initialQuantity: item.quantity,
                        costPrice: item.cost
                    }
                });
            }
        });

    } catch (error) {
        console.error("Transaction Error:", error);
        return { message: "فشل في معالجة الفاتورة. يرجى المحاولة مرة أخرى." };
    }

    revalidatePath("/dashboard/invoices");
    redirect("/dashboard/invoices");
}

export async function deletePurchase(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // حذف عناصر الفاتورة أولاً
            await tx.purchaseItem.deleteMany({
                where: { purchaseId: id }
            });
            // ثم حذف الفاتورة
            await tx.purchase.delete({
                where: { id }
            });
        });
    } catch (error) {
        console.error("Delete Purchase Error:", error);
        return { message: "فشل في حذف الفاتورة" };
    }

    revalidatePath("/dashboard/invoices");
}

