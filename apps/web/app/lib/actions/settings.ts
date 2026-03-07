"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { NextResponse } from "next/server";


// --- Company Settings ---

export async function getCompanySettings() {
    try {
        const settings = await prisma.companySettings.findFirst();
        if (!settings) {
            // Create default if not exists
            return await prisma.companySettings.create({
                data: {
                    name: "Pharmacy System",
                    currency: "IQD"
                }
            });
        }
        return settings;
    } catch (error) {
        console.error("Error fetching settings:", error);
        return null;
    }
}

export async function updateCompanySettings(formData: FormData) {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, message: "غير مصرح" };

    try {
        const name = formData.get("name") as string;
        const phone = formData.get("phone") as string;
        const address = formData.get("address") as string;
        const email = formData.get("email") as string;
        const website = formData.get("website") as string;
        const taxNumber = formData.get("taxNumber") as string;
        const facebookUrl = formData.get("facebookUrl") as string;
        const instagramUrl = formData.get("instagramUrl") as string;
        const maxDiscountPercent = parseFloat(formData.get("maxDiscountPercent") as string) || 10;
        const currency = (formData.get("currency") as string) || "IQD";

        // Logo URL might serve as a hidden input or handled separately if using UploadThing directly in client
        // For now, let's assume it's passed if we have a simple text input or if we handle upload separately
        const logoUrl = formData.get("logoUrl") as string;

        // Check if settings exist
        const existing = await prisma.companySettings.findFirst();

        if (existing) {
            await prisma.companySettings.update({
                where: { id: existing.id },
                data: {
                    name, phone, address, email, website,
                    taxNumber, facebookUrl, instagramUrl,
                    maxDiscountPercent, currency,
                    logoUrl: logoUrl || existing.logoUrl // Keep old logo if not provided
                }
            });
        } else {
            await prisma.companySettings.create({
                data: {
                    name, phone, address, email, website,
                    taxNumber, facebookUrl, instagramUrl,
                    maxDiscountPercent,
                    logoUrl
                }
            });
        }

        revalidatePath("/dashboard/settings");
        return { success: true, message: "تم حفظ الإعدادات بنجاح" };
    } catch (error) {
        console.error("Error updating settings:", error);
        return { success: false, message: "فشل في حفظ الإعدادات" };
    }
}

// --- Backup ---

export async function createBackup() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return { success: false, message: "غير مصرح" };

    try {
        // Fetch all critical data
        const [users, drugs, inventories, sales, patients, suppliers] = await Promise.all([
            prisma.user.findMany(),
            prisma.globalDrug.findMany(),
            prisma.inventory.findMany({ include: { batches: true } }),
            prisma.sale.findMany({ include: { items: true } }),
            prisma.patient.findMany(),
            prisma.supplier.findMany(),
        ]);

        const backupData = {
            timestamp: new Date().toISOString(),
            version: "1.0",
            data: {
                users,
                drugs,
                inventories,
                sales,
                patients,
                suppliers
            }
        };

        return {
            success: true,
            data: JSON.stringify(backupData, null, 2),
            filename: `faramace_backup_${new Date().toISOString().split('T')[0]}.json`
        };
    } catch (error) {
        console.error("Error creating backup:", error);
        return { success: false, message: "فشل في إنشاء النسخة الاحتياطية" };
    }
}
