export const TENANT_TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'subscription', label: 'الاشتراك والفوترة' },
  { id: 'limits', label: 'الحدود والميزات' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'settings', label: 'إعدادات المؤسسة' },
] as const;
export type TenantTab = (typeof TENANT_TABS)[number]['id'];
export function tenantTab(value?: string): TenantTab {
  return TENANT_TABS.find(t => t.id === value)?.id ?? 'overview';
}
export type TenantPlan = {
  id: string; name: string; price: number; isActive?: boolean;
  maxBranches: number; maxUsers: number; maxDevices?: number; maxMobileUsers?: number;
};
export type Tenant = {
  id: string; name: string; ownerEmail: string; planId: string | null;
  plan: TenantPlan | null; isActive: boolean; isTrial: boolean;
  subscriptionEndsAt: string | null; monthlyPrice: number;
  maxBranches: number; maxUsers: number; maxDevices: number; maxMobileUsers: number;
  aiDailyLimit: number; prescriptionScanDailyLimit: number;
};
export type TenantStats = {
  branchCount: number; userCount: number; productCount: number;
  salesCount: number; salesTotal: number; lastSaleAt: string | null;
};
export type TenantPayment = {
  id: string; amount: number; currency: string; gateway: string; status: string;
  renewalMonths: number; createdAt: string; newExpiresAt: string | null;
};
export type TenantDetailData = {
  tenant: Tenant; stats?: TenantStats; payments?: TenantPayment[];
  nextPaymentCursor?: string | null; plans?: TenantPlan[];
};
export function tenantHref(id: string, tab: TenantTab = 'overview') {
  return `/dashboard/admin/tenants/${encodeURIComponent(id)}?tab=${tab}`;
}
export function endingSoon(tenant: Tenant, now = Date.now()) {
  const end = tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt).getTime() : NaN;
  return tenant.isActive && end >= now && end <= now + 7 * 86400000;
}
export function filterTenants(tenants: Tenant[], search: string, status: string, plan: string) {
  const q = search.trim().toLocaleLowerCase();
  return tenants.filter(t => (!q || `${t.name} ${t.ownerEmail}`.toLocaleLowerCase().includes(q))
    && (status === 'all' || (status === 'active' ? t.isActive : !t.isActive))
    && (plan === 'all' || t.planId === plan));
}
export function tenantDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : 'غير محدد';
}
