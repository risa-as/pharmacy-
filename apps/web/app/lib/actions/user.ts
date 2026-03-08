"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


const UserSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "الاسم مطلوب"),
    email: z.string().email("البريد الإلكتروني غير صالح"),
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
    role: z.enum(["ADMIN", "PHARMACIST", "CASHIER"]),
    branchId: z.string().optional().nullable(),
});

const CreateUser = UserSchema.omit({ id: true });
const UpdateUser = UserSchema.omit({ password: true }).extend({
    password: z.string().optional(),
});

export async function createUser(prevState: any, formData: FormData) {
    const validatedFields = CreateUser.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        role: formData.get("role"),
        branchId: formData.get("branchId") || null,
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في إنشاء المستخدم. تحقق من الحقول.",
        };
    }

    const { name, email, password, role, branchId } = validatedFields.data;

    try {
        // التحقق من عدم وجود المستخدم
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return { message: "البريد الإلكتروني مستخدم بالفعل." };
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                branchId: branchId || null,
            },
        });
    } catch (error) {
        console.error("Error creating user:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في إنشاء المستخدم." };
    }

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users");
}

export async function updateUser(
    id: string,
    prevState: any,
    formData: FormData,
) {
    const passwordValue = formData.get("password");

    const validatedFields = UpdateUser.safeParse({
        id: id,
        name: formData.get("name"),
        email: formData.get("email"),
        password: passwordValue && passwordValue !== "" ? passwordValue : undefined,
        role: formData.get("role"),
        branchId: formData.get("branchId") || null,
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في تحديث المستخدم. تحقق من الحقول.",
        };
    }

    const { name, email, password, role, branchId } = validatedFields.data;

    try {
        const updateData: any = {
            name,
            email,
            role,
            branchId: branchId || null,
        };

        // تحديث كلمة المرور فقط إذا تم توفيرها
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await prisma.user.update({
            where: { id },
            data: updateData,
        });
    } catch (error) {
        console.error("Error updating user:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في تحديث المستخدم." };
    }

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users");
}

export async function deleteUser(id: string) {
    try {
        await prisma.user.delete({
            where: { id },
        });
        revalidatePath("/dashboard/users");
    } catch (error) {
        console.error("Error deleting user:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في حذف المستخدم." };
    }
}

export async function getUsers() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    return await prisma.user.findMany({
        where: tenantBranchWhere,
        include: { branch: true },
        orderBy: { createdAt: "desc" },
    });
}

export async function getUserById(id: string) {
    return await prisma.user.findUnique({
        where: { id },
        include: { branch: true },
    });
}
