export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";
import { readTenantDetail, requireTenantAdministrator, TenantReadError } from "@/app/lib/admin-tenant-data";
import { TENANT_TABS, tenantTab } from "@/app/lib/admin-tenants";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const value = request.nextUrl.searchParams.get("tab") ?? "overview";
        await requireTenantAdministrator();
        if (!TENANT_TABS.some(t => t.id === value)) return NextResponse.json({ error: "التبويب غير صالح." }, { status: 400 });
        return NextResponse.json(await readTenantDetail((await context.params).id, tenantTab(value)));
    } catch(e) { return NextResponse.json({ error: e instanceof TenantReadError ? e.message : "تعذر تحميل المؤسسة." }, { status: e instanceof TenantReadError ? e.status : 500 }); }
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // In Next.js App Router, params is a Promise
) {
    try {
        const session = await auth();
        if (!session?.user || (session.user.role !== "SUPER_ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Await the entire params object
        const params = await context.params;
        const tenantId = params.id;
        if (!tenantId) {
            return NextResponse.json({ error: "معرف المؤسسة مطلوب" }, { status: 400 });
        }

        const body = await request.json();
        const { name, plan, maxBranches, maxUsers, maxDevices, maxMobileUsers, aiDailyLimit, prescriptionScanDailyLimit } = body;

        // Fetch plan to validate and get its details
        let selectedPlan = null;
        if (plan) {
            selectedPlan = await prisma.subscriptionPlan.findUnique({ where: { id: plan } });
        }

        const updatedOrganization = await prisma.organization.update({
            where: { id: tenantId },
            data: {
                name: name || undefined,
                planId: selectedPlan?.id || undefined,
                maxBranches: maxBranches !== undefined ? Number(maxBranches) || null : undefined,
                maxUsers: maxUsers !== undefined ? Number(maxUsers) || null : undefined,
                maxDevices: maxDevices !== undefined ? Number(maxDevices) || null : undefined,
                maxMobileUsers: maxMobileUsers !== undefined ? Number(maxMobileUsers) || null : undefined,
                aiDailyLimit: aiDailyLimit !== undefined ? Math.max(0, Number(aiDailyLimit)) : undefined,
                prescriptionScanDailyLimit: prescriptionScanDailyLimit !== undefined ? Math.max(0, Number(prescriptionScanDailyLimit)) : undefined,
            },
            include: { plan: true },
        });

        return NextResponse.json(
            { success: true, organization: updatedOrganization },
            { status: 200 }
        );
    } catch (error: any) {
        console.error("Failed to update tenant:", error);
        return NextResponse.json(
            { error: error.message || "حدث خطأ أثناء التحديث" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user || (session.user.role !== "SUPER_ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await requireTenantAdministrator();

        // Await the entire params object
        const params = await context.params;
        const tenantId = params.id;
        if (!tenantId) {
            return NextResponse.json({ error: "معرف المؤسسة مطلوب" }, { status: 400 });
        }

        // Fetch the organization to ensure it exists
        const organization = await prisma.organization.findUnique({
            where: { id: tenantId },
            include: { branches: true }
        });

        if (!organization) {
            return NextResponse.json({ error: "المؤسسة غير موجودة" }, { status: 404 });
        }

        let body: { confirmationName?: string };
        try { body = await request.json(); } catch { return NextResponse.json({ error: "اكتب اسم المؤسسة لتأكيد الحذف." }, { status: 400 }); }
        if (!body || typeof body.confirmationName !== 'string' || body.confirmationName !== organization.name) {
            return NextResponse.json({ error: "اسم التأكيد لا يطابق اسم المؤسسة الحالي." }, { status: 409 });
        }

        // Delete associated records in a transaction to maintain referential integrity.
        await prisma.$transaction(async (tx: any) => {
            // Find all branches for this organization
            const branchIds = organization.branches.map((b: any) => b.id);

            // 1. Delete associated device licenses
            if (branchIds.length > 0) {
                await tx.deviceLicense.deleteMany({
                    where: { branchId: { in: branchIds } }
                });
            }

            // 2. Delete all users associated with the branches
            if (branchIds.length > 0) {
                await tx.user.deleteMany({
                    where: { branchId: { in: branchIds } }
                });
            }

            // (Add other relations here if they strictly need to be manually deleted,
            // or if onDelete: Cascade is properly set up in the schema, the below is sufficient)
            // But doing it explicitly handles branches without cascades properly.
            // Note: If you have sales, patients, etc., they might block deletion without cascades.

            // 3. Delete branches
            await tx.branch.deleteMany({
                where: { organizationId: tenantId }
            });

            // 4. Finally, delete the organization
            // Recheck the confirmed name at the write itself. A concurrent rename
            // must roll back the related deletions rather than delete stale data.
            const deleted = await tx.organization.deleteMany({
                where: { id: tenantId, name: body.confirmationName }
            });
            if (deleted.count !== 1) {
                throw new TenantReadError("تغيرت بيانات المؤسسة؛ حدّث الصفحة وأعد تأكيد الاسم.", 409);
            }
        });

        return NextResponse.json({ success: true, message: "تم حذف المؤسسة بنجاح" }, { status: 200 });

    } catch (error: any) {
        console.error("Failed to delete tenant:", error);
        return NextResponse.json(
            { error: error instanceof TenantReadError ? error.message : "تعذر حذف المؤسسة؛ قد توجد سجلات مرتبطة بها." },
            { status: error instanceof TenantReadError ? error.status : 500 }
        );
    }
}
