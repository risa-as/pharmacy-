import { auth } from '@/auth';
import { prisma } from './prisma';
import type { Tenant, TenantDetailData, TenantTab } from './admin-tenants';

export class TenantReadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function requireTenantAdministrator() {
  const session = await auth();
  if (!session?.user?.id || (session as any).error) throw new TenantReadError('سجّل الدخول أولًا.', 401);
  if (session.user.role !== 'SUPER_ADMIN') throw new TenantReadError('غير مصرح.', 403);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isActive: true, role: true } });
  if (!user?.isActive || user.role !== 'SUPER_ADMIN') throw new TenantReadError('غير مصرح.', 403);
}
const planSelect = { id: true, name: true, price: true, maxBranches: true, maxUsers: true, maxDevices: true, maxMobileUsers: true } as const;
const baseSelect = {
  id: true, name: true, planId: true, isSuspended: true, isTrial: true, subscriptionEndsAt: true,
  maxBranches: true, maxUsers: true, maxDevices: true, maxMobileUsers: true, aiDailyLimit: true, prescriptionScanDailyLimit: true,
  plan: { select: planSelect },
  branches: { orderBy: { createdAt: 'asc' as const }, take: 1, select: {
    users: { where: { role: 'ADMIN' as const }, orderBy: { createdAt: 'asc' as const }, take: 1, select: { email: true } },
  } },
} as const;
function dto(org: any): Tenant {
  return {
    id: org.id, name: org.name, ownerEmail: org.branches[0]?.users[0]?.email ?? 'غير محدد',
    planId: org.planId, plan: org.plan, isActive: !org.isSuspended, isTrial: org.isTrial,
    subscriptionEndsAt: org.subscriptionEndsAt?.toISOString() ?? null, monthlyPrice: org.plan?.price ?? 0,
    maxBranches: org.maxBranches ?? org.plan?.maxBranches ?? 1, maxUsers: org.maxUsers ?? org.plan?.maxUsers ?? 3,
    maxDevices: org.maxDevices ?? org.plan?.maxDevices ?? 1, maxMobileUsers: org.maxMobileUsers ?? org.plan?.maxMobileUsers ?? 1,
    aiDailyLimit: org.aiDailyLimit, prescriptionScanDailyLimit: org.prescriptionScanDailyLimit,
  };
}
// Deliberately omits inventory/sales aggregates and user records from the directory.
export async function compactTenants(): Promise<Tenant[]> {
  await requireTenantAdministrator();
  return (await prisma.organization.findMany({ select: baseSelect, orderBy: { createdAt: 'desc' } })).map(dto);
}
export async function readTenantDetail(id: string, tab: TenantTab): Promise<TenantDetailData> {
  await requireTenantAdministrator();
  const org = await prisma.organization.findUnique({ where: { id }, select: baseSelect });
  if (!org) throw new TenantReadError('المؤسسة غير موجودة.', 404);
  const result: TenantDetailData = { tenant: dto(org) };
  if (tab === 'overview') {
    const branches = await prisma.branch.findMany({ where: { organizationId: id }, select: { id: true } });
    const branchIds = branches.map(b => b.id);
    const [sales, productCount, userCount] = await Promise.all([
      prisma.sale.aggregate({ where: { branchId: { in: branchIds } }, _count: { _all: true }, _sum: { total: true }, _max: { createdAt: true } }),
      prisma.inventory.count({ where: { branchId: { in: branchIds } } }),
      prisma.user.count({ where: { branchId: { in: branchIds } } }),
    ]);
    result.stats = { branchCount: branches.length, userCount, productCount, salesCount: sales._count._all,
      salesTotal: sales._sum.total ?? 0, lastSaleAt: sales._max.createdAt?.toISOString() ?? null };
  }
  if (tab === 'subscription') {
    const rows = await prisma.paymentTransaction.findMany({ where: { organizationId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
      select: { id: true, amount: true, currency: true, gateway: true, status: true, renewalMonths: true, createdAt: true, newExpiresAt: true } });
    result.payments = rows.map(p => ({ ...p, createdAt: p.createdAt.toISOString(), newExpiresAt: p.newExpiresAt?.toISOString() ?? null }));
  }
  if (tab === 'limits' || tab === 'settings') {
    result.plans = await prisma.subscriptionPlan.findMany({ select: { ...planSelect, isActive: true }, orderBy: { price: 'asc' } });
  }
  return result;
}
