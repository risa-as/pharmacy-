"use server";

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

const BranchSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "اسم الفرع مطلوب"),
  organizationId: z.string().min(1, "المنظمة مطلوبة"),
});

const CreateBranch = BranchSchema.omit({ id: true });
const UpdateBranch = BranchSchema;

export async function createBranch(prevState: any, formData: FormData) {
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
