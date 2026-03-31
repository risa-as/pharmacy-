"use server";

import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPlanLimit } from "@/app/lib/saas-guards";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


const BranchSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "اسم الفرع مطلوب"),
  organizationId: z.string().min(1, "المنظمة مطلوبة"),
});

const CreateBranch = BranchSchema.omit({ id: true });
const UpdateBranch = BranchSchema;

export async function createBranch(prevState: any, formData: FormData) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
  if (!tenantCtx.userPermissions.canManageBranches) return { message: "ليس لديك صلاحية لإدارة الفروع." };

  const validatedFields = CreateBranch.safeParse({
    name: formData.get("name"),
    organizationId: formData.get("organizationId"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "فشل في إنشاء الفرع. تحقق من الحقول.",
    };
  }

  const { name, organizationId } = validatedFields.data;

  // Iron Wall: enforce per-plan branch limit
  const limitCheck = await checkPlanLimit(organizationId, "branches");
  if (!limitCheck.allowed) {
    return {
      limitReached: true,
      current: limitCheck.current,
      max: limitCheck.max,
      upgradeRequired: true,
      message: `لقد وصلت إلى الحد الأقصى من الفروع في خطتك (${limitCheck.current}/${limitCheck.max}). يرجى الترقية للاستمرار.`,
    };
  }

  try {
    await prisma.branch.create({
      data: {
        name,
        organizationId,
      },
    });
  } catch (error) {
    return {
      message: "خطأ في قاعدة البيانات: فشل في إنشاء الفرع.",
    };
  }

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches");
}

export async function updateBranch(
  id: string,
  prevState: any,
  formData: FormData
) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
  if (!tenantCtx.userPermissions.canManageBranches) return { message: "ليس لديك صلاحية لتعديل الفروع." };

  const validatedFields = UpdateBranch.safeParse({
    id: id,
    name: formData.get("name"),
    organizationId: formData.get("organizationId"),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "فشل في تحديث الفرع. تحقق من الحقول.",
    };
  }

  const { name, organizationId } = validatedFields.data;

  try {
    await prisma.branch.update({
      where: { id },
      data: {
        name,
        organizationId,
      },
    });
  } catch (error) {
    return {
      message: "خطأ في قاعدة البيانات: فشل في تحديث الفرع.",
    };
  }

  revalidatePath("/dashboard/branches");
  redirect("/dashboard/branches");
}

export async function deleteBranch(id: string) {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
  if (!tenantCtx.userPermissions.canManageBranches) return { message: "ليس لديك صلاحية لحذف الفروع." };

  try {
    await prisma.branch.delete({
      where: { id },
    });
    revalidatePath("/dashboard/branches");
  } catch (error) {
    return { message: "خطأ في قاعدة البيانات: فشل في حذف الفرع." };
  }
}

export async function getBranchById(id: string) {
  return await prisma.branch.findUnique({
    where: { id },
    include: { organization: true },
  });
}
