"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { logAudit } from "@/app/lib/audit";


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
    if (!tenantCtx.userPermissions.canCreatePurchase || !tenantCtx.organizationId) return { message: 'ليس لديك صلاحية إدارة الموردين ضمن مؤسسة.' };

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
        const newSupplier = await prisma.supplier.create({
            data: {
                name,
                email: email || null,
                phone: phone || null,
                address: address || null,
                organizationId: tenantCtx.organizationId,
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'SUPPLIER',
            entityId: newSupplier.id,
            details: JSON.stringify({ name }),
            branchId: tenantCtx.user.branchId ?? undefined,
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
    if (!tenantCtx.userPermissions.canCreatePurchase || !tenantCtx.organizationId) return { message: 'ليس لديك صلاحية إدارة الموردين ضمن مؤسسة.' };

    try {
        // Enforce tenant isolation
        const supplier = await prisma.supplier.findFirst({
            where: { id, organizationId: tenantCtx.organizationId }
        });

        if (!supplier) {
            return { message: "لا يمكنك حذف هذا المورد لأنه لا يخص مؤسستك." };
        }

        // Check for existing purchases
        if (supplier.warehouseId) return { message: 'هذا المورد مرتبط بمذخر على المنصة ولا يمكن حذفه يدوياً.' };
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
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'DELETE',
            entity: 'SUPPLIER',
            entityId: id,
            details: JSON.stringify({ name: supplier.name }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });
        revalidatePath("/dashboard/suppliers");
    } catch (error) {
        console.error("Delete Supplier Error:", error);
        return { message: "خطأ في قاعدة البيانات: فشل حذف المورد." };
    }
}

export async function getSupplierById(id: string) {
    try {
        const ctx = await getTenantContext();
        if (ctx instanceof NextResponse || !ctx.userPermissions.canViewSuppliers || (!ctx.organizationId && ctx.user.role !== 'SUPER_ADMIN')) return null;
        const supplier = await prisma.supplier.findFirst({
            where: { id, ...(ctx.user.role === 'SUPER_ADMIN' ? {} : { organizationId: ctx.organizationId }) },
        });
        return supplier;
    } catch (error) {
        return null;
    }
}

export async function updateSupplier(id: string, prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canCreatePurchase || !tenantCtx.organizationId) return { message: 'ليس لديك صلاحية إدارة الموردين ضمن مؤسسة.' };

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

        // المورد المرتبط بمذخر تبقى بياناته المحلية قابلة للتعديل من المؤسسة
        // (§182): الاسم/الهاتف/البريد/العنوان تسميات الصيدلية لمورّدها، وحجبها
        // بالكامل كان يعني أن ربط مورد قديم بمذخر يُجمّد بياناته إلى الأبد.
        // ما يبقى ممنوعاً: الحذف (أدناه في deleteSupplier)، وتغيير warehouseId أو
        // organizationId — وهما غير قابلين للكتابة من هنا أصلاً لأن كائن data
        // مبنيّ من حقول صريحة لا من نشر الجسم. تعديل الاسم هنا لا يمسّ اسم
        // المذخر ولا بيانات حسابه؛ لا مزامنة ضمنية بين الكيانين (§183).
        await prisma.supplier.update({
            where: { id },
            data: {
                name,
                email: email || null,
                phone: phone || null,
                address: address || null,
            },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'SUPPLIER',
            entityId: id,
            details: JSON.stringify({ name }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });
    } catch (error) {
        return {
            message: "حدث خطأ أثناء تحديث بيانات المورد. يرجى المحاولة مرة أخرى.",
        };
    }

    revalidatePath("/dashboard/suppliers");
    redirect("/dashboard/suppliers");
}

