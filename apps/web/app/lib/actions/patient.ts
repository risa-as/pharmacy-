import { Prisma } from '@prisma/client';
"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


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
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

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

    const branchId = tenantCtx.user.branchId || null;

    try {
        // Tenant-scoped phone uniqueness check
        const existing = await prisma.patient.findFirst({
            where: { phone, ...tenantCtx.tenantBranchWhere },
        });
        if (existing) {
            return { message: "رقم الهاتف مسجل مسبقاً في هذا الفرع" };
        }

        await prisma.patient.create({
            data: {
                name,
                phone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender: gender || null,
                allergies: allergies ? allergies.split(",").map((s: any) => s.trim()).filter(Boolean) : [],
                chronicDiseases: chronicDiseases ? chronicDiseases.split(",").map((s: any) => s.trim()).filter(Boolean) : [],
                notes: notes || null,
                branchId,
            },
        });
    } catch (error: any) {
        if (error.code === "P2002") {
            return { message: "رقم الهاتف مسجل مسبقاً في هذا الفرع" };
        }
        console.error("Create Patient Error: ", error);
        return { message: "حدث خطأ أثناء إنشاء المريض" };
    }

    revalidatePath("/dashboard/patients");
    redirect("/dashboard/patients");
}

// تحديث مريض
export async function updatePatient(id: string, prevState: any, formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    // Authorization check
    const existingPatient = await prisma.patient.findFirst({
        where: { id, ...tenantCtx.tenantBranchWhere }
    });
    if (!existingPatient) return { message: "غير مصرح لك بتعديل هذا المريض" };

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
        // Tenant-scoped phone uniqueness check (excluding the patient being updated)
        if (phone !== existingPatient.phone) {
            const duplicate = await prisma.patient.findFirst({
                where: { phone, ...tenantCtx.tenantBranchWhere, NOT: { id } },
            });
            if (duplicate) return { message: "رقم الهاتف مسجل مسبقاً في هذا الفرع" };
        }

        await prisma.patient.update({
            where: { id },
            data: {
                name,
                phone,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                gender: gender || null,
                allergies: allergies ? allergies.split(",").map((s: any) => s.trim()) : [],
                chronicDiseases: chronicDiseases ? chronicDiseases.split(",").map((s: any) => s.trim()) : [],
                notes: notes || null,
            },
        });
    } catch (error: any) {
        if (error.code === "P2002") return { message: "رقم الهاتف مسجل مسبقاً في هذا الفرع" };
        return { message: "حدث خطأ أثناء تحديث المريض" };
    }

    revalidatePath("/dashboard/patients");
    redirect("/dashboard/patients");
}

// حذف مريض
export async function deletePatient(id: string) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { message: "غير مصرح" };

    try {
        // التحقق من وجود ارتباطات
        const patient = await prisma.patient.findFirst({
            where: { id, ...tenantCtx.tenantBranchWhere },
            include: {
                _count: { select: { sales: true } },
                loyaltyAccount: true,
            },
        });

        if (!patient) {
            return { message: "المريض غير موجود" };
        }

        const reasons: string[] = [];
        if (patient._count.sales > 0) reasons.push(`${patient._count.sales} فاتورة مبيعات`);
        if (patient.loyaltyAccount) reasons.push("حساب ولاء");

        if (reasons.length > 0) {
            return { message: `لا يمكن حذف المريض لوجود ارتباطات: ${reasons.join("، ")}` };
        }

        // حذف آمن — لا توجد ارتباطات حرجة
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // حذف الوصفات إن وُجدت
            const prescriptions = await tx.prescription.findMany({ where: { patientId: id }, select: { id: true } });
            if (prescriptions.length > 0) {
                await tx.prescriptionItem.deleteMany({ where: { prescriptionId: { in: prescriptions.map((p: any) => p.id) } } });
                await tx.prescription.deleteMany({ where: { patientId: id } });
            }
            await tx.insurancePolicy.deleteMany({ where: { patientId: id } });
            await tx.patient.delete({ where: { id } });
        });
    } catch (error) {
        console.error("Delete patient error:", error);
        return { message: "حدث خطأ أثناء حذف المريض" };
    }

    revalidatePath("/dashboard/patients");
}

// جلب جميع المرضى
export async function getPatients() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    return await prisma.patient.findMany({
        where: tenantBranchWhere,
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
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;

    return await prisma.patient.findFirst({
        where: { id, ...tenantCtx.tenantBranchWhere },
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
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;

    return await prisma.patient.findFirst({
        where: { phone, ...tenantCtx.tenantBranchWhere },
        include: {
            prescriptions: {
                where: { status: "PENDING" },
                include: { items: true },
            },
        },
    });
}
