"use server";

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

const SupplierSchema = z.object({
    id: z.string(),
    name: z.string().min(1, "Supplier name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    address: z.string().optional(),
});

const CreateSupplier = SupplierSchema.omit({ id: true });
const UpdateSupplier = SupplierSchema;

export async function createSupplier(prevState: any, formData: FormData) {
    const validatedFields = CreateSupplier.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing Fields. Failed to Create Supplier.",
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
            },
        });
    } catch (error) {
        return {
            message: "Database Error: Failed to Create Supplier.",
        };
    }

    revalidatePath("/dashboard/suppliers");
    redirect("/dashboard/suppliers");
}

export async function deleteSupplier(id: string) {
    try {
        await prisma.supplier.delete({
            where: { id },
        });
        revalidatePath("/dashboard/suppliers");
    } catch (error) {
        return { message: "Database Error: Failed to Delete Supplier." };
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
    const validatedFields = CreateSupplier.safeParse({
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone"),
        address: formData.get("address"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing Fields. Failed to Update Supplier.",
        };
    }

    const { name, email, phone, address } = validatedFields.data;

    try {
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
            message: "Database Error: Failed to Update Supplier.",
        };
    }

    revalidatePath("/dashboard/suppliers");
    redirect("/dashboard/suppliers");
}

