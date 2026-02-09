"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const prisma = new PrismaClient();

// ==================== شركات التأمين ====================

const InsuranceCompanySchema = z.object({
    name: z.string().min(2, "اسم الشركة مطلوب"),
    discountRate: z.coerce.number().min(0).max(100),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional().or(z.literal("")),
});

// إنشاء شركة تأمين
export async function createInsuranceCompany(prevState: any, formData: FormData) {
    const validatedFields = InsuranceCompanySchema.safeParse({
        name: formData.get("name"),
        discountRate: formData.get("discountRate"),
        contactPhone: formData.get("contactPhone"),
        contactEmail: formData.get("contactEmail"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { name, discountRate, contactPhone, contactEmail } = validatedFields.data;

    try {
        await prisma.insuranceCompany.create({
            data: {
                name,
                discountRate,
                contactPhone: contactPhone || null,
                contactEmail: contactEmail || null,
            },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء إنشاء شركة التأمين" };
    }

    revalidatePath("/dashboard/insurance");
    redirect("/dashboard/insurance");
}

// تحديث شركة تأمين
export async function updateInsuranceCompany(id: string, prevState: any, formData: FormData) {
    const validatedFields = InsuranceCompanySchema.safeParse({
        name: formData.get("name"),
        discountRate: formData.get("discountRate"),
        contactPhone: formData.get("contactPhone"),
        contactEmail: formData.get("contactEmail"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { name, discountRate, contactPhone, contactEmail } = validatedFields.data;

    try {
        await prisma.insuranceCompany.update({
            where: { id },
            data: {
                name,
                discountRate,
                contactPhone: contactPhone || null,
                contactEmail: contactEmail || null,
            },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء تحديث شركة التأمين" };
    }

    revalidatePath("/dashboard/insurance");
    redirect("/dashboard/insurance");
}

// حذف شركة تأمين
export async function deleteInsuranceCompany(id: string) {
    try {
        await prisma.insuranceCompany.delete({ where: { id } });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف شركة التأمين" };
    }

    revalidatePath("/dashboard/insurance");
}

// جلب جميع شركات التأمين
export async function getInsuranceCompanies() {
    return await prisma.insuranceCompany.findMany({
        orderBy: { name: "asc" },
        where: { isActive: true },
    });
}

// ==================== بوليصات التأمين ====================

const InsurancePolicySchema = z.object({
    patientId: z.string().min(1, "المريض مطلوب"),
    companyId: z.string().min(1, "شركة التأمين مطلوبة"),
    policyNumber: z.string().min(1, "رقم البوليصة مطلوب"),
    expiryDate: z.string().min(1, "تاريخ الانتهاء مطلوب"),
    coverageRate: z.coerce.number().min(0).max(100),
});

// إضافة بوليصة تأمين لمريض
export async function createInsurancePolicy(prevState: any, formData: FormData) {
    const validatedFields = InsurancePolicySchema.safeParse({
        patientId: formData.get("patientId"),
        companyId: formData.get("companyId"),
        policyNumber: formData.get("policyNumber"),
        expiryDate: formData.get("expiryDate"),
        coverageRate: formData.get("coverageRate"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { patientId, companyId, policyNumber, expiryDate, coverageRate } = validatedFields.data;

    try {
        await prisma.insurancePolicy.create({
            data: {
                patientId,
                companyId,
                policyNumber,
                expiryDate: new Date(expiryDate),
                coverageRate,
            },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء إضافة البوليصة" };
    }

    revalidatePath(`/dashboard/patients/${patientId}`);
    return { success: true };
}

// حذف بوليصة تأمين
export async function deleteInsurancePolicy(id: string, patientId: string) {
    try {
        await prisma.insurancePolicy.delete({ where: { id } });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف البوليصة" };
    }

    revalidatePath(`/dashboard/patients/${patientId}`);
}

// جلب بوليصات مريض
export async function getPatientPolicies(patientId: string) {
    return await prisma.insurancePolicy.findMany({
        where: { patientId },
        include: { company: true },
        orderBy: { expiryDate: "desc" },
    });
}
