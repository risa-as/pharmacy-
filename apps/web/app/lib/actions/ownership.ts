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

    const where = { id, organizationId: null };
    const { count } = kind === "insurance"
        ? await prisma.insuranceCompany.updateMany({ where, data })
        : await prisma.discount.updateMany({ where, data });
    if (count === 0) throw new Error("السجل غير موجود أو له مالك بالفعل");

    revalidatePath("/dashboard/admin/ownership");
}
