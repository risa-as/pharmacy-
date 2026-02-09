"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const prisma = new PrismaClient();

// Schema للتحقق
const PatientSchema = z.object({
    name: z.string().min(2, "الاسم مطلوب"),
    phone: z.string().min(10, "رقم الهاتف غير صالح"),
    dateOfBirth: z.string().optional(),
    gender: z.string().optional(),
    allergies: z.string().optional(),
    chronicDiseases: z.string().optional(),
    notes: z.string().optional(),
});

// إنشاء مريض جديد
export async function createPatient(prevState: any, formData: FormData) {
    const validatedFields = PatientSchema.safeParse({
        name: formData.get("name"),
        phone: formData.get("phone"),
        dateOfBirth: formData.get("dateOfBirth"),
        gender: formData.get("gender"),
        allergies: formData.get("allergies"),
        chronicDiseases: formData.get("chronicDiseases"),
        notes: formData.get("notes"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { name, phone, dateOfBirth, gender, allergies, chronicDiseases, notes } = validatedFields.data;

    try {
        await prisma.patient.create({
            data: {
                name,
                phone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender: gender || null,
                allergies: allergies ? allergies.split(",").map(s => s.trim()) : [],
                chronicDiseases: chronicDiseases ? chronicDiseases.split(",").map(s => s.trim()) : [],
                notes: notes || null,
            },
        });
    } catch (error: any) {
        if (error.code === "P2002") {
            return { message: "رقم الهاتف مسجل مسبقاً" };
        }
        return { message: "حدث خطأ أثناء إنشاء المريض" };
    }

    revalidatePath("/dashboard/patients");
    redirect("/dashboard/patients");
}

// تحديث مريض
export async function updatePatient(id: string, prevState: any, formData: FormData) {
    const validatedFields = PatientSchema.safeParse({
        name: formData.get("name"),
        phone: formData.get("phone"),
        dateOfBirth: formData.get("dateOfBirth"),
        gender: formData.get("gender"),
        allergies: formData.get("allergies"),
        chronicDiseases: formData.get("chronicDiseases"),
        notes: formData.get("notes"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { name, phone, dateOfBirth, gender, allergies, chronicDiseases, notes } = validatedFields.data;

    try {
        await prisma.patient.update({
            where: { id },
            data: {
                name,
                phone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender: gender || null,
                allergies: allergies ? allergies.split(",").map(s => s.trim()) : [],
                chronicDiseases: chronicDiseases ? chronicDiseases.split(",").map(s => s.trim()) : [],
                notes: notes || null,
            },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء تحديث المريض" };
    }

    revalidatePath("/dashboard/patients");
    redirect("/dashboard/patients");
}

// حذف مريض
export async function deletePatient(id: string) {
    try {
        await prisma.patient.delete({ where: { id } });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف المريض" };
    }

    revalidatePath("/dashboard/patients");
}

// جلب جميع المرضى
export async function getPatients() {
    return await prisma.patient.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            prescriptions: {
                orderBy: { createdAt: "desc" },
                take: 5,
            },
        },
    });
}

// جلب مريض بالـ ID
export async function getPatientById(id: string) {
    return await prisma.patient.findUnique({
        where: { id },
        include: {
            prescriptions: {
                orderBy: { createdAt: "desc" },
                include: { items: true },
            },
            insurancePolicies: {
                include: { company: true },
            },
        },
    });
}

// البحث عن مريض بالهاتف
export async function searchPatientByPhone(phone: string) {
    return await prisma.patient.findUnique({
        where: { phone },
        include: {
            prescriptions: {
                where: { status: "PENDING" },
                include: { items: true },
            },
        },
    });
}
