import { Prisma } from '@prisma/client';

/**
 * Loyalty points per dinar in force now for a branch's organisation, or 0 when
 * its programme is off. Stamped on each sale and debt payment when the server
 * records it (server clock, never the device's), so the earn cap in sync/loyalty
 * values every payment at its own rate and a later rate change does not
 * re-value history.
 */
type Db = Pick<Prisma.TransactionClient, 'branch'>;

/** The rate for a debt payment on this sale: the sale's branch, as of now. */
export async function loyaltyRateForSale(
    db: Pick<Prisma.TransactionClient, 'branch' | 'sale'>, saleId: string,
): Promise<number> {
    const sale = await db.sale.findUnique({ where: { id: saleId }, select: { branchId: true } });
    return sale ? loyaltyRateForBranch(db, sale.branchId) : 0;
}

/** Both values stamped on a sale: the earn rate and one point's redemption value. */
export async function saleLoyaltyStamp(db: Db, branchId: string): Promise<{ loyaltyRate: number; loyaltyRedemptionValue: number }> {
    const branch = await db.branch.findUnique({
        where: { id: branchId },
        select: { organization: { select: { loyaltyEnabled: true, loyaltyPointsPerDinar: true, loyaltyRedemptionValue: true } } },
    });
    const org = branch?.organization;
    return { loyaltyRate: org?.loyaltyEnabled ? org.loyaltyPointsPerDinar : 0, loyaltyRedemptionValue: org?.loyaltyRedemptionValue ?? 0 };
}

export async function loyaltyRateForBranch(db: Db, branchId: string): Promise<number> {
    const branch = await db.branch.findUnique({
        where: { id: branchId },
        select: { organization: { select: { loyaltyEnabled: true, loyaltyPointsPerDinar: true } } },
    });
    const org = branch?.organization;
    return org?.loyaltyEnabled ? org.loyaltyPointsPerDinar : 0;
}
