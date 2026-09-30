export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
import { aiUsageToday } from '@/app/lib/ai-usage';

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

  // Same counting rule as the reservation (failed provider calls do not count).
  return NextResponse.json(await aiUsageToday(organizationId));
}
