// Server component — feature gate wrapper for the client Marketplace page
export const dynamic = 'force-dynamic';

import { getTenantContext } from '@/app/lib/tenant-utils';
import { requireFeature } from '@/app/lib/page-guards';
import UpgradeRequired from '@/app/ui/plan-enforcement/UpgradeRequired';
import { NextResponse } from 'next/server';
import MarketplaceClient from './MarketplaceClient';

export default async function MarketplacePage() {
    const tenantCtx = await getTenantContext();
    if (tenantCtx instanceof NextResponse) return null;

    const { organizationId } = tenantCtx;
    if (organizationId) {
        const upgrade = await requireFeature(organizationId, 'marketplace');
        if (upgrade) return <UpgradeRequired {...upgrade} />;
    }

    return <MarketplaceClient />;
}
