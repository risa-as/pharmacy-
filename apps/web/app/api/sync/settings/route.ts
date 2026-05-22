export const dynamic = 'force-dynamic';

import { prisma } from "@/app/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { validateSyncUser } from '@/app/lib/sync-auth';

export async function GET(req: NextRequest) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        const { searchParams } = new URL(req.url);
        const branchId = searchParams.get('branchId');

        // Loyalty settings are authoritative in Organization — always override
        // CompanySettings values with the Organization's current values when a
        // branchId is supplied (Desktop always sends it).
        if (branchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: {
                    organizationId: true,
                    organization: {
                        select: {
                            loyaltyEnabled: true,
                            loyaltyPointsPerDinar: true,
                            loyaltyRedemptionValue: true,
                            loyaltyMinRedemption: true,
                        }
                    }
                }
            });

            // Base settings filtered by this branch's organization
            const settings = await prisma.companySettings.findFirst({
                where: { organizationId: branch?.organizationId ?? undefined },
            });

            if (branch?.organization) {
                const org = branch.organization;
                return NextResponse.json({
                    ...(settings || {}),
                    // Organization values always win for loyalty
                    loyaltyEnabled: org.loyaltyEnabled,
                    loyaltyPointsPerDinar: org.loyaltyPointsPerDinar,
                    loyaltyRedemptionValue: org.loyaltyRedemptionValue,
                    loyaltyMinRedemption: org.loyaltyMinRedemption,
                });
            }

            return NextResponse.json(settings || {});
        }

        return NextResponse.json({});
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }
}
