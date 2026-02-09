"use server";

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

const OrganizationSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Organization name is required"),
});

const CreateOrganization = OrganizationSchema.omit({ id: true });
const UpdateOrganization = OrganizationSchema;

export async function createOrganization(prevState: any, formData: FormData) {
    const validatedFields = CreateOrganization.safeParse({
        name: formData.get("name"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing Fields. Failed to Create Organization.",
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
            message: "Database Error: Failed to Create Organization.",
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
    const validatedFields = UpdateOrganization.safeParse({
        id: id,
        name: formData.get("name"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing Fields. Failed to Update Organization.",
        };
    }

    const { name } = validatedFields.data;

    try {
        await prisma.organization.update({
            where: { id },
            data: { name },
        });
    } catch (error) {
        return { message: "Database Error: Failed to Update Organization." };
    }

    revalidatePath("/dashboard/organizations");
    redirect("/dashboard/organizations");
}

export async function deleteOrganization(id: string) {
    try {
        await prisma.organization.delete({
            where: { id },
        });
        revalidatePath("/dashboard/organizations");
    } catch (error) {
        return { message: "Database Error: Failed to Delete Organization." };
    }
}
