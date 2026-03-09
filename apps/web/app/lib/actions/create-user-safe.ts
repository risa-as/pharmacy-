"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import bcrypt from "bcryptjs";
import { checkPlanLimit } from "@/app/lib/saas-guards";

const UserSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "الاسم مطلوب"),
    email: z.string().email("البريد الإلكتروني غير صالح"),
    password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
    role: z.enum(["ADMIN", "PHARMACIST", "CASHIER"]),
    branchId: z.string().optional().nullable(),
});

const CreateUser = UserSchema.omit({ id: true });

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

    // Iron Wall: enforce per-plan user limit.
    // Derive organizationId from the target branch, or fall back to the first org.
    const orgRef = branchId
        ? await prisma.branch.findUnique({ where: { id: branchId }, select: { organizationId: true } })
        : await prisma.branch.findFirst({ select: { organizationId: true } });

    if (orgRef?.organizationId) {
        const limitCheck = await checkPlanLimit(orgRef.organizationId, "users");
        if (!limitCheck.allowed) {
            return {
                limitReached: true,
                current: limitCheck.current,
                max: limitCheck.max,
                upgradeRequired: true,
                message: `لقد وصلت إلى الحد الأقصى من المستخدمين في خطتك (${limitCheck.current}/${limitCheck.max}). يرجى الترقية للاستمرار.`,
            };
        }
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
