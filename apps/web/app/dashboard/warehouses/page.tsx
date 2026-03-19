// Server component — feature gate wrapper for the client Warehouses page
import { getTenantContext } from '@/app/lib/tenant-utils';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { NextResponse } from 'next/server';
import WarehousesClient from './WarehousesClient';

export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;

    const { organizationId } = tenantCtx;
    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'warehouseManagement');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    return <WarehousesClient />;
}
