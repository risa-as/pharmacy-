export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { validateSyncUser, isBranchInSyncScope, hasSyncPermission } from '@/app/lib/sync-auth';
import { requestDeviceId } from '@/app/lib/operator-proof';

/**
 * POST /api/sales/allocate-number
 *
 * Atomically allocates the next per-organization sequential invoice number from
 * the shared InvoiceCounter and returns it. The desktop POS calls this at sale
 * time (when online) so the printed receipt shows the SAME number the web
 * dashboard will display. The number is then sent back in /sync/sales, which
 * reuses it instead of allocating a new one.
 *
 * Uses the exact same counter logic as /api/sync/sales so all sources
 * (web POS, desktop online, desktop offline-at-sync) share one sequence.
 */
export async function POST(req: Request) {
    try {
        const syncUser = await validateSyncUser(req);
        if (syncUser instanceof NextResponse) return syncUser;

        if (!hasSyncPermission(syncUser, 'canSell')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const branchId: string | undefined = body?.branchId;

        // Resolve the organization that owns the counter.
        let orgId = syncUser.organizationId ?? undefined;
        if (branchId) {
            if (!(await isBranchInSyncScope(syncUser, branchId))) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            const branch = await prisma.branch.findUnique({
                where: { id: branchId },
                select: { organizationId: true },
            });
            orgId = orgId ?? branch?.organizationId ?? undefined;
        }

        if (!orgId) {
            return NextResponse.json({ error: 'Organization not resolved' }, { status: 400 });
        }

        // The reservation names who received the number, so /sync/sales keeps it
        // only for a sale sent by the same device license or account.
        const licenseId = branchId ? await requestDeviceId(prisma, req, branchId) : null;
        const invoiceNumber = await prisma.$transaction(async (tx) => {
            const [counter] = await tx.$queryRaw<[{ nextNumber: bigint }]>`
                INSERT INTO "InvoiceCounter" ("organizationId", "nextNumber")
                VALUES (${orgId}::text, 2)
                ON CONFLICT ("organizationId")
                DO UPDATE SET "nextNumber" = "InvoiceCounter"."nextNumber" + 1
                RETURNING "nextNumber"
            `;
            const number = Number(counter.nextNumber) - 1;
            await tx.invoiceNumberReservation.create({ data: { organizationId: orgId!, number, licenseId, userId: syncUser.id } });
            return number;
        });

        return NextResponse.json({ success: true, invoiceNumber });
    } catch (error) {
        console.error('allocate-number error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
