import { Prisma } from '@prisma/client';
import { loyaltyRateForBranch } from './loyalty-rate';

/** Loyalty tier from lifetime points (same thresholds as the desktop and sync/loyalty). */
export function loyaltyTier(lifetimePoints: number): string {
    if (lifetimePoints >= 20000) return 'GOLD';
    if (lifetimePoints >= 5000) return 'SILVER';
    return 'BRONZE';
}

/** Movements that settle a return: earned points taken back, redeemed points given back. */
export const RETURN_EARN = 'RETURN_EARN';
export const RETURN_REDEEM = 'RETURN_REDEEM';

/**
 * Brings a sale's loyalty in line with its returns. Idempotent: it computes the
 * total that should have been settled so far and posts only the difference, under
 * a per-patient lock, so a re-sent return, a second partial return, or points that
 * sync after the return all end at the same balance, never settled twice.
 *
 *  - Earned points: the share of the cash actually refunded, at the rate stamped on
 *    the sale (current rate for sales recorded before stamping), never more than
 *    the points earned on that sale. A credit sale's return cancels debt and
 *    refunds no cash, so it takes nothing back.
 *  - Redeemed points: the returned share of the goods (quantity × sold price).
 *    The cash refund covers only the customer's paid share (after discount), so
 *    the points that paid the rest come back in the same proportion — including
 *    a sale paid entirely with points, whose total and refund are zero.
 * The balance may go negative (points already spent); sync/loyalty then holds
 * further redemptions until later earnings bring it back.
 *
 * Returns the loyalty account touched, or null.
 */
export async function settleSaleLoyalty(tx: Prisma.TransactionClient, saleId: string): Promise<string | null> {
    const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: { total: true, branchId: true, patientId: true, loyaltyRate: true, payment: { select: { method: true } },
            branch: { select: { organization: { select: { loyaltyEnabled: true } } } } },
    });
    if (!sale?.patientId) return null;
    // Loyalty off: a return never touches points (old balances stay as they are),
    // and this adds nothing but this read to the return.
    if (!sale.branch.organization.loyaltyEnabled) return null;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'loyalty-patient:' + sale.patientId}::text, 0))`;
    const account = await tx.loyaltyAccount.findUnique({ where: { patientId: sale.patientId } });
    if (!account) return null;

    const refunds = await tx.saleReturn.aggregate({ where: { saleId }, _sum: { total: true }, _count: true });
    if (!refunds._count) return null;
    const returned = refunds._sum.total ?? 0;
    // Returned share by goods, not money: a sale paid entirely with points has a
    // zero total and refunds no cash, yet its points must come back.
    const sold = await tx.saleItem.findMany({ where: { saleId }, select: { drugId: true, quantity: true, price: true } });
    const back = await tx.saleReturnItem.findMany({ where: { saleReturn: { saleId } }, select: { drugId: true, quantity: true } });
    const priceOf = new Map(sold.map(i => [i.drugId, i.price]));
    const gross = sold.reduce((s, i) => s + i.quantity * i.price, 0);
    const returnedGross = back.reduce((s, i) => s + i.quantity * (priceOf.get(i.drugId) ?? 0), 0);
    const sums = await tx.$queryRaw<{ type: string; points: number }[]>`
        SELECT type, COALESCE(SUM(ABS(points)), 0)::int AS points FROM "LoyaltyTransaction"
        WHERE "accountId" = ${account.id} AND "saleId" = ${saleId} GROUP BY type`;
    const sum = (type: string) => sums.find(r => r.type === type)?.points ?? 0;

    const rate = sale.loyaltyRate ?? await loyaltyRateForBranch(tx, sale.branchId);
    const refundedCash = sale.payment?.method === 'CREDIT' ? 0 : returned;
    const takeBack = Math.min(sum('EARN'), Math.floor(refundedCash * rate + 1e-9)) - sum(RETURN_EARN);
    const share = gross > 0 ? Math.min(1, returnedGross / gross) : 0;
    const giveBack = Math.floor(sum('REDEEM') * share + 1e-9) - sum(RETURN_REDEEM);
    if (takeBack <= 0 && giveBack <= 0) return null;

    if (takeBack > 0) await tx.loyaltyTransaction.create({ data: {
        accountId: account.id, type: RETURN_EARN, points: takeBack, saleId, description: 'سحب نقاط مقابل مرتجع',
    } });
    if (giveBack > 0) await tx.loyaltyTransaction.create({ data: {
        accountId: account.id, type: RETURN_REDEEM, points: giveBack, saleId, description: 'إعادة نقاط مستبدلة مقابل مرتجع',
    } });
    const lifetimePoints = account.lifetimePoints - Math.max(0, takeBack);
    await tx.loyaltyAccount.update({ where: { id: account.id }, data: {
        totalPoints: account.totalPoints - Math.max(0, takeBack) + Math.max(0, giveBack),
        lifetimePoints, tier: loyaltyTier(lifetimePoints),
    } });
    return account.id;
}
