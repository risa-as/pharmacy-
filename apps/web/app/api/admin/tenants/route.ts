import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import bcrypt from 'bcryptjs';
import { generateLicenseKey } from '@/app/lib/license-utils';

export const dynamic = 'force-dynamic';

// GET: List all tenants (super admin only)
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || (session.user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const organizations = await prisma.organization.findMany({
            include: {
                plan: true,
                branches: {
                    include: { users: { where: { role: 'ADMIN' } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // ── Per-organization activity statistics ────────────────────────────
        // Roll branch-level aggregates up to the tenant level using a handful of
        // cheap groupBy queries (instead of N queries per tenant). These let the
        // super admin gauge whether a tenant is actually using the system.
        const branchToOrg = new Map<string, string>();
        for (const org of organizations) {
            for (const b of org.branches) branchToOrg.set(b.id, org.id);
        }
        const allBranchIds = Array.from(branchToOrg.keys());

        const [salesAgg, inventoryAgg, userAgg] = await Promise.all([
            prisma.sale.groupBy({
                by: ['branchId'],
                where: { branchId: { in: allBranchIds } },
                _count: { _all: true },
                _sum: { total: true },
                _max: { createdAt: true },
            }),
            prisma.inventory.groupBy({
                by: ['branchId'],
                where: { branchId: { in: allBranchIds } },
                _count: { _all: true },
            }),
            prisma.user.groupBy({
                by: ['branchId'],
                where: { branchId: { in: allBranchIds } },
                _count: { _all: true },
            }),
        ]);

        type OrgStat = {
            branchCount: number;
            userCount: number;
            productCount: number;
            salesCount: number;
            salesTotal: number;
            lastSaleAt: Date | null;
        };
        const statsByOrg = new Map<string, OrgStat>();
        for (const org of organizations) {
            statsByOrg.set(org.id, {
                branchCount: org.branches.length,
                userCount: 0,
                productCount: 0,
                salesCount: 0,
                salesTotal: 0,
                lastSaleAt: null,
            });
        }
        for (const row of salesAgg) {
            const orgId = branchToOrg.get(row.branchId);
            if (!orgId) continue;
            const st = statsByOrg.get(orgId)!;
            st.salesCount += row._count._all;
            st.salesTotal += row._sum.total ?? 0;
            const d = row._max.createdAt;
            if (d && (!st.lastSaleAt || d > st.lastSaleAt)) st.lastSaleAt = d;
        }
        for (const row of inventoryAgg) {
            const orgId = branchToOrg.get(row.branchId);
            if (orgId) statsByOrg.get(orgId)!.productCount += row._count._all;
        }
        for (const row of userAgg) {
            if (!row.branchId) continue;
            const orgId = branchToOrg.get(row.branchId);
            if (orgId) statsByOrg.get(orgId)!.userCount += row._count._all;
        }

        const tenants = organizations.map((org: any) => {
            // Find the main owner/admin from the first branch
            const owner = org.branches[0]?.users[0];
            return {
                id: org.id,
                name: org.name,
                slug: org.id, // Or another generated slug
                ownerEmail: owner?.email || 'N/A',
                planId: org.plan?.id,
                plan: org.plan,
                maxBranches: org.maxBranches ?? org.plan?.maxBranches ?? 1,
                maxUsers: org.maxUsers ?? org.plan?.maxUsers ?? 3,
                maxDevices: org.maxDevices ?? org.plan?.maxDevices ?? 1,
                maxMobileUsers: org.maxMobileUsers ?? org.plan?.maxMobileUsers ?? 1,
                aiDailyLimit: org.aiDailyLimit ?? 50,
                prescriptionScanDailyLimit: org.prescriptionScanDailyLimit ?? 20,
                monthlyPrice: org.plan?.price || 0,
                isActive: !org.isSuspended,
                isTrial: org.isTrial ?? false,
                subscriptionEndsAt: org.subscriptionEndsAt ?? null,
                isSuspended: org.isSuspended,
                stats: statsByOrg.get(org.id) ?? {
                    branchCount: 0, userCount: 0, productCount: 0,
                    salesCount: 0, salesTotal: 0, lastSaleAt: null,
                },
            };
        });

        return NextResponse.json({ tenants });
    } catch (e: any) {
        console.error("==> Error in /api/admin/tenants:", e.message);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST: Create a new tenant (onboarding)
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || (session.user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, ownerEmail, ownerName, ownerPassword, plan, maxBranches, maxUsers, maxDevices, maxMobileUsers, trialDays } = body;

        // Optional free trial: when trialDays > 0, set the subscription to expire
        // after that many days and flag the org as a trial. Reuses subscriptionEndsAt
        // so all existing subscription enforcement applies automatically.
        const trialDaysNum = Math.floor(Number(trialDays));
        const hasTrial = Number.isFinite(trialDaysNum) && trialDaysNum > 0;
        const trialEndsAt = hasTrial ? new Date(Date.now() + trialDaysNum * 24 * 60 * 60 * 1000) : null;

        if (!name || !ownerEmail || !ownerPassword) {
            return NextResponse.json({ error: "الاسم، الإيميل، وكلمة المرور مطلوبة" }, { status: 400 });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
        if (existingUser) {
            return NextResponse.json(
                { error: "يوجد مستخدم مسجل بنفس البريد الإلكتروني مسبقاً" },
                { status: 409 }
            );
        }

        // Fetch plan, fallback to first active FREE plan
        let selectedPlan = null;
        if (plan) {
            selectedPlan = await prisma.subscriptionPlan.findUnique({ where: { id: plan } });
        }
        if (!selectedPlan) {
            selectedPlan = await prisma.subscriptionPlan.findFirst({
                where: { name: 'FREE', isActive: true }
            });
        }
        if (!selectedPlan) {
            return NextResponse.json({ error: "لا توجد باقة صالحة تم العثور عليها" }, { status: 400 });
        }

        // Generate unique license key
        let licenseKey = generateLicenseKey();
        let exists = await prisma.deviceLicense.findUnique({ where: { licenseKey } });
        while (exists) {
            licenseKey = generateLicenseKey();
            exists = await prisma.deviceLicense.findUnique({ where: { licenseKey } });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(ownerPassword, 10);

        // Run everything in a single transaction
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Create Organization
            const organization = await tx.organization.create({
                data: {
                    name,
                    planId: selectedPlan.id,
                    maxBranches: maxBranches || selectedPlan.maxBranches,
                    maxUsers: maxUsers || selectedPlan.maxUsers,
                    maxDevices: maxDevices !== undefined ? Number(maxDevices) : selectedPlan.maxDevices,
                    maxMobileUsers: maxMobileUsers !== undefined ? Number(maxMobileUsers) : selectedPlan.maxMobileUsers,
                    isTrial: hasTrial,
                    subscriptionEndsAt: trialEndsAt,
                },
            });

            // 2. Create Branch (default "الفرع الرئيسي")
            const branch = await tx.branch.create({
                data: {
                    name: "الفرع الرئيسي",
                    organizationId: organization.id,
                },
            });

            // 3. Create Admin User linked to the branch
            const adminUser = await tx.user.create({
                data: {
                    email: ownerEmail,
                    name: ownerName || name,
                    password: hashedPassword,
                    role: "ADMIN",
                    branchId: branch.id,
                },
            });

            // 4. Create DeviceLicense linked to the branch
            const license = await tx.deviceLicense.create({
                data: {
                    licenseKey,
                    branchId: branch.id,
                    isActive: true,
                    // Optionally set expiresAt based on the plan, or allow overriding
                },
            });

            return {
                organization,
                branch,
                user: adminUser,
                license
            };
        });

        // Return in the same shape as GET
        const tenant = {
            id: result.organization.id,
            name: result.organization.name,
            slug: result.organization.id,
            ownerEmail,
            planId: selectedPlan.id,
            plan: selectedPlan,
            maxBranches: result.organization.maxBranches ?? selectedPlan.maxBranches,
            maxUsers: result.organization.maxUsers ?? selectedPlan.maxUsers,
            maxDevices: result.organization.maxDevices ?? selectedPlan.maxDevices ?? 1,
            maxMobileUsers: result.organization.maxMobileUsers ?? selectedPlan.maxMobileUsers ?? 1,
            monthlyPrice: selectedPlan.price,
            isActive: !result.organization.isSuspended,
            isTrial: result.organization.isTrial ?? false,
            subscriptionEndsAt: result.organization.subscriptionEndsAt ?? null,
            licenseKey: result.license.licenseKey // Useful to show right after creation
        };

        return NextResponse.json({ tenant, success: true }, { status: 201 });
    } catch (e: any) {
        console.error("==> Error creating tenant:", e?.message);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
