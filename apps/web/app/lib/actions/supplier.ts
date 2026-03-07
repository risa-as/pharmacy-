"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


const SupplierSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "اسم المورد مطلوب"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
});

const CreateSupplier = SupplierSchema.omit({ id: true });
const UpdateSupplier = SupplierSchema;

export async function createSupplier(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    const validatedFields = CreateSupplier.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "يرجى ملء جميع الحقول المطلوبة.",
        };
    }

    const { name, email, phone, address } = validatedFields.data;

    try {
        await prisma.supplier.create({
            data: {
                name,
                email: email || null,
                phone: phone || null,
                address: address || null,
                organizationId: tenantCtx.organizationId,
            },
        });
    } catch (error) {
        return {
            message: "حدث خطأ أثناء إضافة المورد. يرجى المحاولة مرة أخرى.",
        };
    }

    revalidatePath("/dashboard/suppliers");
    redirect("/dashboard/suppliers");
}

export async function deleteSupplier(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    try {
        // Enforce tenant isolation
        const supplier = await prisma.supplier.findFirst({
            where: { id, organizationId: tenantCtx.organizationId }
        });

        if (!supplier) {
            return { message: "لا يمكنك حذف هذا المورد لأنه لا يخص مؤسستك." };
        }

        // Check for existing purchases
        const purchaseCount = await prisma.purchase.count({
            where: { supplierId: id },
        });

        if (purchaseCount > 0) {
            return {
                message: "لا يمكن حذف المورد لوجود فواتير شراء مرتبطة به.",
            };
        }

        await prisma.supplier.delete({
            where: { id },
        });
        revalidatePath("/dashboard/suppliers");
    } catch (error) {
        console.error("Delete Supplier Error:", error);
        return { message: "خطأ في قاعدة البيانات: فشل حذف المورد." };
    }
}

export async function getSupplierById(id: string) {
    try {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
        });
        return supplier;
    } catch (error) {
        return null;
    }
}

export async function updateSupplier(id: string, prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    const validatedFields = CreateSupplier.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "يرجى ملء جميع الحقول المطلوبة.",
        };
    }

    const { name, email, phone, address } = validatedFields.data;

    try {
        // Enforce tenant isolation
        const existingSupplier = await prisma.supplier.findFirst({
            where: { id, organizationId: tenantCtx.organizationId }
        });

        if (!existingSupplier) {
            return { message: "لا يمكنك تعديل بيانات هذا المورد لأنه لا يخص مؤسستك." };
        }

        await prisma.supplier.update({
            where: { id },
            data: {
                name,
                email: email || null,
                phone: phone || null,
                address: address || null,
            },
        });
    } catch (error) {
        return {
            message: "حدث خطأ أثناء تحديث بيانات المورد. يرجى المحاولة مرة أخرى.",
        };
    }

    revalidatePath("/dashboard/suppliers");
    redirect("/dashboard/suppliers");
}

