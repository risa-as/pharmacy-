"use server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * N20 transition: SUPER_ADMIN settles legacy insurance companies and discounts
 * that no organisation owns — assign each to its organisation, or mark it a
 * platform record every organisation may read. Only rows without an owner are
 * touched; an owned row is never reassigned here.
 */
export async function settleOwnership(formData: FormData): Promise<void> {
    const session = await auth();
    if ((session?.user as any)?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");

    const kind = String(formData.get("kind") ?? "");
    const id = String(formData.get("id") ?? "");
    const target = String(formData.get("target") ?? "");
    if (!id || !target || (kind !== "insurance" && kind !== "discount")) throw new Error("طلب غير صالح");

    let data: { organizationId: string | null; isPlatformShared: boolean };
    if (target === "shared") {
        data = { organizationId: null, isPlatformShared: true };
    } else {
        const org = await prisma.organization.findUnique({ where: { id: target }, select: { id: true } });
        if (!org) throw new Error("المؤسسة غير موجودة");
        data = { organizationId: org.id, isPlatformShared: false };
    }

    await prisma.$transaction(async tx => {
        const where = { id, organizationId: null, isPlatformShared: false };
        const { count } = kind === "insurance"
            ? await tx.insuranceCompany.updateMany({ where, data })
            : await tx.discount.updateMany({ where, data });
        if (count === 0) throw new Error("السجل غير موجود أو سُوّيت ملكيته بالفعل");
        // Ownership and its audit evidence commit together. An audit failure
        // must not leave an undocumented reassignment behind.
        await tx.auditLog.create({ data: {
            userId: session!.user!.id!,
            userName: session!.user!.name ?? session!.user!.email ?? 'SUPER_ADMIN',
            action: 'SETTLE_OWNERSHIP',
            entity: kind === 'insurance' ? 'INSURANCE_COMPANY' : 'DISCOUNT',
            entityId: id,
            details: JSON.stringify({ before: { organizationId: null, isPlatformShared: false }, after: data }),
        } });
    });

    revalidatePath("/dashboard/admin/ownership");
}
