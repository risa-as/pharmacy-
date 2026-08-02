"use server";

import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/app/lib/audit";

/**
 * Promotes an organisation's private drugs into the shared global catalogue by
 * clearing their organizationId. The rows keep their ids, so inventories, sales
 * and every other FK reference survive untouched — only visibility changes.
 */

export interface SkippedDrug {
    barcode: string;
    tradeName: string;
    reason: "already-global" | "duplicate-barcode";
}

export type GlobalizeResult =
    | { success: true; organizationName: string; promoted: number; skipped: SkippedDrug[] }
    | { success: false; error: string; skipped?: SkippedDrug[] };

export async function globalizeOrganizationDrugs(organizationId: string): Promise<GlobalizeResult> {
    const session = await auth();
    const user = session?.user as { id?: string; name?: string; role?: string } | undefined;
    if (user?.role !== "SUPER_ADMIN") {
        return { success: false, error: "غير مصرح: يتطلب صلاحية SUPER_ADMIN" };
    }
    if (!organizationId) {
        return { success: false, error: "المؤسسة مطلوبة" };
    }

    try {
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true },
        });
        if (!org) return { success: false, error: "المؤسسة غير موجودة" };

        const custom = await prisma.globalDrug.findMany({
            where: { organizationId },
            select: { id: true, barcode: true, tradeName: true },
            orderBy: { tradeName: "asc" },
        });
        if (custom.length === 0) {
            return { success: false, error: "لا توجد أدوية خاصة بهذه المؤسسة" };
        }

        // Postgres treats NULLs as distinct in unique indexes, so
        // @@unique([barcode, organizationId]) does NOT stop a second global row
        // with the same barcode from being created. This pre-check is the only
        // thing keeping duplicates out of the shared catalogue — a failed merge
        // would be silent, not an error.
        const barcodes = Array.from(new Set(custom.map((d) => d.barcode)));
        const existingGlobal = await prisma.globalDrug.findMany({
            where: { organizationId: null, barcode: { in: barcodes } },
            select: { barcode: true },
        });
        const taken = new Set(existingGlobal.map((g) => g.barcode));

        const seen = new Set<string>();
        const promote: string[] = [];
        const skipped: SkippedDrug[] = [];

        for (const d of custom) {
            if (taken.has(d.barcode)) {
                skipped.push({ barcode: d.barcode, tradeName: d.tradeName, reason: "already-global" });
                continue;
            }
            // Two private rows sharing a barcode: promote the first, hold the rest
            // back so one click can never introduce a duplicate.
            if (seen.has(d.barcode)) {
                skipped.push({ barcode: d.barcode, tradeName: d.tradeName, reason: "duplicate-barcode" });
                continue;
            }
            seen.add(d.barcode);
            promote.push(d.id);
        }

        if (promote.length === 0) {
            return {
                success: false,
                error: "كل هذه الأدوية لها باركود موجود مسبقاً في الكتالوج العالمي — لم يتم تحويل أي دواء.",
                skipped,
            };
        }

        const res = await prisma.globalDrug.updateMany({
            where: { id: { in: promote } },
            data: { organizationId: null },
        });

        // The promoted ids are the rollback record: restoring means setting
        // organizationId back to this org for exactly these ids.
        await logAudit({
            userId: user.id || "unknown",
            userName: user.name || "SUPER_ADMIN",
            action: "GLOBALIZE",
            entity: "GLOBAL_DRUG",
            entityId: org.id,
            details: JSON.stringify({
                organizationName: org.name,
                promoted: res.count,
                skipped: skipped.length,
                promotedIds: promote,
            }),
        });

        revalidatePath("/dashboard/admin/drugs");
        return { success: true, organizationName: org.name, promoted: res.count, skipped };
    } catch (error: any) {
        console.error("[globalizeOrganizationDrugs] failed:", error);
        return { success: false, error: error?.message || "تعذر تحويل الأدوية." };
    }
}
