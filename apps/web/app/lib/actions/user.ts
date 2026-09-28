"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { checkPlanLimit } from "@/app/lib/saas-guards";
import { NextResponse } from "next/server";
import { logAudit } from "@/app/lib/audit";
import { USER_SAFE_SELECT, findManagedUser, findScopedBranch, mayAssignRole } from "@/app/lib/user-scope";


const UserSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "الاسم مطلوب"),
    email: z.string().email("البريد الإلكتروني غير صالح"),
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
    role: z.enum(["ADMIN", "PHARMACIST", "CASHIER"]),
    branchId: z.string().min(1, "الفرع مطلوب"),
});

const CreateUser = UserSchema.omit({ id: true });
const UpdateUser = UserSchema.omit({ password: true }).extend({
    password: z.string().optional(),
});

export async function createUser(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canManageUsers) return { message: "ليس لديك صلاحية لإدارة المستخدمين." };

    const validatedFields = CreateUser.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        role: formData.get("role"),
        branchId: formData.get("branchId") ?? "",
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في إنشاء المستخدم. تحقق من الحقول.",
        };
    }

    const { name, email, password, role, branchId } = validatedFields.data;

    const branch = await findScopedBranch(tenantCtx, branchId);
    if (!branch) return { message: "الفرع خارج نطاق مؤسستك." };
    if (!mayAssignRole(tenantCtx, role)) return { message: "لا يمكنك منح دور المدير." };

    // Enforce the per-plan user limit of the branch's (verified) organisation.
    const limit = await checkPlanLimit(branch.organizationId, "users");
    if (!limit.allowed) {
        return { message: `لقد وصلت إلى الحد الأقصى للمستخدمين (${limit.max}) في خطتك الحالية.` };
    }

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

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                branchId: branch.id,
            },
        });

        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'CREATE',
            entity: 'USER',
            entityId: newUser.id,
            details: JSON.stringify({ name, email, role }),
            branchId: branch.id,
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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canManageUsers) return { message: "ليس لديك صلاحية لتعديل المستخدمين." };
    const passwordValue = formData.get("password");

    const validatedFields = UpdateUser.safeParse({
        id: id,
        name: formData.get("name"),
        email: formData.get("email"),
        password: passwordValue && passwordValue !== "" ? passwordValue : undefined,
        role: formData.get("role"),
        branchId: formData.get("branchId") ?? "",
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "فشل في تحديث المستخدم. تحقق من الحقول.",
        };
    }

    const { name, email, password, role, branchId } = validatedFields.data;

    // The target must be a user the caller manages (a branch in the caller's scope: not
    // the platform owner, not a warehouse user, not another organisation), and it may only
    // be moved to a branch in the same scope (user-scope.ts).
    const target = await findManagedUser(tenantCtx, id);
    if (!target) return { message: "غير مصرح: المستخدم خارج نطاق مؤسستك." };
    const branch = await findScopedBranch(tenantCtx, branchId);
    if (!branch) return { message: "الفرع خارج نطاق مؤسستك." };
    if (role !== target.role && !mayAssignRole(tenantCtx, role)) return { message: "لا يمكنك منح دور المدير." };

    try {
        const updateData: any = {
            name,
            email,
            role,
            branchId: branch.id,
        };

        // تحديث كلمة المرور فقط إذا تم توفيرها
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await prisma.user.update({
            where: { id },
            data: updateData,
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'UPDATE',
            entity: 'USER',
            entityId: id,
            details: JSON.stringify({ name, email, role }),
            branchId: branch.id,
        });
    } catch (error) {
        console.error("Error updating user:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في تحديث المستخدم." };
    }

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users");
}

export async function deleteUser(id: string) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canManageUsers) {
        return { message: "ليس لديك صلاحية لحذف المستخدمين." };
    }
    try {
        // Same rule as editing: only a user the caller manages (user-scope.ts).
        const user = await findManagedUser(tenantCtx, id);
        if (!user) return { message: "غير مصرح: المستخدم خارج نطاق مؤسستك." };
        await prisma.user.delete({
            where: { id },
        });
        await logAudit({
            userId: tenantCtx.user.id,
            userName: tenantCtx.user.name ?? tenantCtx.user.email ?? 'Unknown',
            action: 'DELETE',
            entity: 'USER',
            entityId: id,
            details: JSON.stringify({ name: user?.name, email: user?.email }),
            branchId: tenantCtx.user.branchId ?? undefined,
        });
        revalidatePath("/dashboard/users");
    } catch (error) {
        console.error("Error deleting user:", error);
        return { message: "خطأ في قاعدة البيانات: فشل في حذف المستخدم." };
    }
}

export async function getUsers() {
    const tenantCtx = await getTenantContext('read');
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    return await prisma.user.findMany({
        where: tenantBranchWhere,
        select: USER_SAFE_SELECT,
        orderBy: { createdAt: "desc" },
    });
}

export async function getUserById(id: string) {
    const tenantCtx = await getTenantContext('read');
    if (tenantCtx instanceof NextResponse) return null;
    return findManagedUser(tenantCtx, id);
}
