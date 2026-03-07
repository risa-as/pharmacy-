export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { auth } from "@/auth";

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> } // In Next.js App Router, params is a Promise
) {
    try {
        const session = await auth();
        if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Await the entire params object
        const params = await context.params;
        const tenantId = params.id;
        if (!tenantId) {
            return NextResponse.json({ error: "معرف المؤسسة مطلوب" }, { status: 400 });
        }

        const body = await request.json();
        const { name, plan, maxBranches, maxUsers } = body;

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
                maxBranches: maxBranches || selectedPlan?.maxBranches || undefined,
                maxUsers: maxUsers || selectedPlan?.maxUsers || undefined,
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
        if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

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

        // Delete associated records in a transaction to maintain referential integrity.
        await prisma.$transaction(async (tx) => {
            // Find all branches for this organization
            const branchIds = organization.branches.map(b => b.id);

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
            await tx.organization.delete({
                where: { id: tenantId }
            });
        });

        return NextResponse.json({ success: true, message: "تم حذف المؤسسة بنجاح" }, { status: 200 });

    } catch (error: any) {
        console.error("Failed to delete tenant:", error);
        return NextResponse.json(
            { error: error.message || "حدث خطأ أثناء الحذف" },
            { status: 500 }
        );
    }
}
