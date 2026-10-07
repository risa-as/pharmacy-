import { notFound, redirect } from 'next/navigation';
import { readTenantDetail, TenantReadError } from '@/app/lib/admin-tenant-data';
import { tenantTab } from '@/app/lib/admin-tenants';
import TenantDetail from '@/app/ui/admin/tenants/tenant-detail';
export const dynamic = 'force-dynamic';
export default async function TenantPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const tab = tenantTab(typeof query.tab === 'string' ? query.tab : undefined);
  try {
    const data = await readTenantDetail(id, tab);
    return <TenantDetail key={`${id}:${tab}`} data={data} tab={tab} />;
  } catch(e) {
    if (e instanceof TenantReadError) {
      if (e.status === 404) notFound();
      if (e.status === 401) redirect('/login');
      if (e.status === 403) redirect('/dashboard');
    }
    throw e;
  }
}
