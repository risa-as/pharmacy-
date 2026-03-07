"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


// Schema للتحقق
const PrescriptionSchema = z.object({
    patientId: z.string().min(1, "المريض مطلوب"),
    doctorName: z.string().optional(),
    clinicName: z.string().optional(),
    notes: z.string().optional(),
});

// إنشاء وصفة جديدة
export async function createPrescription(prevState: any, formData: FormData) {
    const validatedFields = PrescriptionSchema.safeParse({
        patientId: formData.get("patientId"),
        doctorName: formData.get("doctorName"),
        clinicName: formData.get("clinicName"),
        notes: formData.get("notes"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { patientId, doctorName, clinicName, notes } = validatedFields.data;

    // جلب عناصر الوصفة من FormData
    const itemsData = formData.get("itemsData");
    let items: any[] = [];
    try {
        items = itemsData ? JSON.parse(itemsData as string) : [];
    } catch {
        return { message: "خطأ في بيانات الأدوية" };
    }

    if (items.length === 0) {
        return { message: "يجب إضافة دواء واحد على الأقل" };
    }

    try {
        await prisma.prescription.create({
            data: {
                patientId,
                doctorName: doctorName || null,
                clinicName: clinicName || null,
                notes: notes || null,
                items: {
                    create: items.map((item: any) => ({
                        drugId: item.drugId,
                        quantity: item.quantity,
                        dosage: item.dosage || null,
                        instructions: item.instructions || null,
                    })),
                },
            },
        });
    } catch (error) {
        console.error(error);
        return { message: "حدث خطأ أثناء إنشاء الوصفة" };
    }

    revalidatePath("/dashboard/prescriptions");
    redirect("/dashboard/prescriptions");
}

// صرف الوصفة (كاملة أو جزئية)
export async function dispensePrescription(prescriptionId: string, itemIds: string[]) {
    try {
        // تحديث العناصر المصروفة
        await prisma.prescriptionItem.updateMany({
            where: { id: { in: itemIds } },
            data: { isDispensed: true },
        });

        // التحقق من حالة الوصفة
        const prescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: { items: true },
        });

        if (prescription) {
            const allDispensed = prescription.items.every((item: any) => item.isDispensed);
            const someDispensed = prescription.items.some((item: any) => item.isDispensed);

            let newStatus: "PENDING" | "PARTIALLY_DISPENSED" | "DISPENSED" = "PENDING";
            if (allDispensed) {
                newStatus = "DISPENSED";
            } else if (someDispensed) {
                newStatus = "PARTIALLY_DISPENSED";
            }

            await prisma.prescription.update({
                where: { id: prescriptionId },
                data: { status: newStatus },
            });
        }

        revalidatePath("/dashboard/prescriptions");
        return { success: true };
    } catch (error) {
        return { message: "حدث خطأ أثناء صرف الوصفة" };
    }
}

// إلغاء الوصفة
export async function cancelPrescription(id: string) {
    try {
        await prisma.prescription.update({
            where: { id },
            data: { status: "CANCELLED" },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء إلغاء الوصفة" };
    }

    revalidatePath("/dashboard/prescriptions");
}

// جلب جميع الوصفات
export async function getPrescriptions() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    return await prisma.prescription.findMany({
        where: { patient: tenantBranchWhere },
        orderBy: { createdAt: "desc" },
        include: {
            patient: true,
            items: true,
        },
    });
}

// جلب وصفة بالـ ID
export async function getPrescriptionById(id: string) {
    return await prisma.prescription.findUnique({
        where: { id },
        include: {
            patient: true,
            items: true,
        },
    });
}

// جلب الوصفات المعلقة
export async function getPendingPrescriptions() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return [];
    const { tenantBranchWhere } = tenantCtx;

    return await prisma.prescription.findMany({
        where: {
            status: { in: ["PENDING", "PARTIALLY_DISPENSED"] },
            patient: tenantBranchWhere,
        },
        orderBy: { createdAt: "desc" },
        include: {
            patient: true,
            items: true,
        },
    });
}

// تحديث وصفة
export async function updatePrescription(id: string, prevState: any, formData: FormData) {
    const validatedFields = PrescriptionSchema.safeParse({
        patientId: formData.get("patientId"),
        doctorName: formData.get("doctorName"),
        clinicName: formData.get("clinicName"),
        notes: formData.get("notes"),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "خطأ في البيانات المدخلة",
        };
    }

    const { patientId, doctorName, clinicName, notes } = validatedFields.data;

    try {
        await prisma.prescription.update({
            where: { id },
            data: {
                patientId,
                doctorName: doctorName || null,
                clinicName: clinicName || null,
                notes: notes || null,
            },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء تحديث الوصفة" };
    }

    revalidatePath("/dashboard/prescriptions");
    redirect("/dashboard/prescriptions");
}

// حذف وصفة
export async function deletePrescription(id: string) {
    try {
        // حذف عناصر الوصفة أولاً
        await prisma.prescriptionItem.deleteMany({
            where: { prescriptionId: id },
        });
        // ثم حذف الوصفة
        await prisma.prescription.delete({
            where: { id },
        });
    } catch (error) {
        return { message: "حدث خطأ أثناء حذف الوصفة" };
    }

    revalidatePath("/dashboard/prescriptions");
}

