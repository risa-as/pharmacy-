"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


const OrganizationSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "اسم المنظمة مطلوب"),
});

const CreateOrganization = OrganizationSchema.omit({ id: true });
const UpdateOrganization = OrganizationSchema;

export async function createOrganization(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (tenantCtx.user.role !== 'SUPER_ADMIN') return { message: "هذا الإجراء متاح للمشرف العام فقط." };

    const validatedFields = CreateOrganization.safeParse({
        name: formData.get("name"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "يرجى ملء جميع الحقول المطلوبة.",
        };
    }

    const { name } = validatedFields.data;

    try {
        await prisma.organization.create({
            data: {
                name,
            },
        });
    } catch (error) {
        return {
            message: "حدث خطأ أثناء إنشاء المنظمة. يرجى المحاولة مرة أخرى.",
        };
    }

    revalidatePath("/dashboard/organizations");
    redirect("/dashboard/organizations");
}

export async function updateOrganization(
    id: string,
    prevState: any,
    formData: FormData,
) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (tenantCtx.user.role !== 'SUPER_ADMIN' && tenantCtx.user.organizationId !== id) {
        return { message: "غير مصرح: لا يمكنك تعديل منظمة أخرى." };
    }

    const validatedFields = UpdateOrganization.safeParse({
        id: id,
        name: formData.get("name"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "يرجى ملء جميع الحقول المطلوبة.",
        };
    }

    const { name } = validatedFields.data;

    try {
        await prisma.organization.update({
            where: { id },
            data: { name },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء تحديث المنظمة. يرجى المحاولة مرة أخرى." };
    }

    revalidatePath("/dashboard/organizations");
    redirect("/dashboard/organizations");
}

export async function deleteOrganization(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (tenantCtx.user.role !== 'SUPER_ADMIN') return { message: "هذا الإجراء متاح للمشرف العام فقط." };

    try {
        await prisma.organization.delete({
            where: { id },
        });
        revalidatePath("/dashboard/organizations");
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف المنظمة. يرجى المحاولة مرة أخرى." };
    }
}
