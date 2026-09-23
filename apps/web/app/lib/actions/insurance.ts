"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";
import { changeableByTenant, ownerForNewRow, readableByTenant } from "@/app/lib/tenant-owned";


// ==================== شركات التأمين ====================

const InsuranceCompanySchema = z.object({
    name: z.string().min(2, "اسم الشركة مطلوب"),
    discountRate: z.coerce.number().min(0).max(100),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional().or(z.literal("")),
});

// إنشاء شركة تأمين
export async function createInsuranceCompany(prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditPatient) return { message: "ليس لديك صلاحية لإدارة التأمين." };

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
                // N20: owned by the creating organisation, never shared implicitly.
                organizationId: ownerForNewRow(tenantCtx),
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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditPatient) return { message: "ليس لديك صلاحية لإدارة التأمين." };
    // N20: only the owning organisation (or SUPER_ADMIN for legacy rows) may change it.
    const owned = await prisma.insuranceCompany.findUnique({ where: { id }, select: { organizationId: true } });
    if (!changeableByTenant(tenantCtx, owned)) return { message: "غير مصرح: شركة التأمين ليست تابعة لمؤسستك." };

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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditPatient) return { message: "ليس لديك صلاحية لإدارة التأمين." };
    const owned = await prisma.insuranceCompany.findUnique({ where: { id }, select: { organizationId: true } });
    if (!changeableByTenant(tenantCtx, owned)) return { message: "غير مصرح: شركة التأمين ليست تابعة لمؤسستك." };

    try {
        await prisma.insuranceCompany.delete({ where: { id } });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف شركة التأمين" };
    }

    revalidatePath("/dashboard/insurance");
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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditPatient) return { message: "ليس لديك صلاحية لإدارة التأمين." };

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

    // N20: the patient must be in the caller's scope and the company readable by it.
    const [patient, company] = await Promise.all([
        prisma.patient.findFirst({ where: { AND: [tenantCtx.tenantBranchWhere, { id: patientId }] }, select: { id: true } }),
        prisma.insuranceCompany.findFirst({ where: { AND: [readableByTenant(tenantCtx), { id: companyId, isActive: true }] }, select: { id: true } }),
    ]);
    if (!patient || !company) return { message: "المريض أو شركة التأمين خارج نطاق مؤسستك." };

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
    const tenantCtx = await getTenantContext('write');
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };
    if (!tenantCtx.userPermissions.canEditPatient) return { message: "ليس لديك صلاحية لإدارة التأمين." };

    try {
        // N20: a policy is deleted only through a patient in the caller's scope.
        const { count } = await prisma.insurancePolicy.deleteMany({ where: { id, patient: tenantCtx.tenantBranchWhere } });
        if (count === 0) return { message: "البوليصة غير موجودة ضمن نطاق مؤسستك." };
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف البوليصة" };
    }

    revalidatePath(`/dashboard/patients/${patientId}`);
}
