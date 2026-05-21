export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { prisma } from '@/app/lib/prisma';

function getIraqDayStart(): Date {
  const iraqOffset = 3 * 60 * 60 * 1000;
  const nowInIraq = new Date(Date.now() + iraqOffset);
  const midnightIraq = new Date(Date.UTC(
    nowInIraq.getUTCFullYear(),
    nowInIraq.getUTCMonth(),
    nowInIraq.getUTCDate(),
    0, 0, 0, 0
  ) - iraqOffset);
  return midnightIraq;
}

export async function GET() {
  const tenantCtx = await getTenantContext();
  if (tenantCtx instanceof NextResponse) return tenantCtx;

  const { organizationId, user } = tenantCtx;
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
  }
  if (!organizationId) {
    return NextResponse.json({ error: 'المؤسسة غير موجودة' }, { status: 400 });
  }

  const dayStart = getIraqDayStart();

  const [org, used] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiDailyLimit: true },
    }),
    prisma.aiUsageLog.count({
      where: { organizationId, createdAt: { gte: dayStart } },
    }),
  ]);

  const limit = org?.aiDailyLimit ?? 50;
  const remaining = Math.max(0, limit - used);

  return NextResponse.json({ limit, used, remaining });
}
