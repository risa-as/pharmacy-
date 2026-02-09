"use server";

import { PrismaClient, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const prisma = new PrismaClient();

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
    try {
        await prisma.discount.delete({
            where: { id },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف العرض" };
    }

    revalidatePath("/dashboard/discounts");
}

// Get all discounts
export async function getDiscounts() {
    return await prisma.discount.findMany({
        orderBy: { createdAt: "desc" },
    });
}

// Get active discounts
export async function getActiveDiscounts() {
    const now = new Date();
    return await prisma.discount.findMany({
        where: {
            isActive: true,
            startDate: { lte: now },
            endDate: { gte: now },
        },
    });
}

// Get discount by ID
export async function getDiscountById(id: string) {
    return await prisma.discount.findUnique({
        where: { id },
    });
}

// Apply discount to a sale
export async function applyDiscount(code: string, subtotal: number, drugIds: string[]) {
    const now = new Date();

    const discount = await prisma.discount.findFirst({
        where: {
            code,
            isActive: true,
            startDate: { lte: now },
            endDate: { gte: now },
            minPurchase: { lte: subtotal },
        },
    });

    if (!discount) {
        return { error: "كود الخصم غير صالح أو منتهي" };
    }

    // Check if discount applies to the selected drugs
    if (!discount.applyToAll && discount.drugIds.length > 0) {
        const applicable = drugIds.some(id => discount.drugIds.includes(id));
        if (!applicable) {
            return { error: "الخصم لا ينطبق على هذه المنتجات" };
        }
    }

    let discountAmount = 0;
    if (discount.type === "PERCENTAGE") {
        discountAmount = (subtotal * discount.value) / 100;
        if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
            discountAmount = discount.maxDiscount;
        }
    } else {
        discountAmount = discount.value;
    }

    return {
        discount,
        discountAmount,
        finalTotal: subtotal - discountAmount,
    };
}
