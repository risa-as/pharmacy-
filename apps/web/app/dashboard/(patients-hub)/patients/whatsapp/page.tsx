import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { WhatsAppManager } from "@/app/ui/patients/whatsapp-ui";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/app/ui/data-table";
export const dynamic = "force-dynamic";
export default async function WhatsAppPage() {
  const ctx = await getTenantContext("read");
  if (ctx instanceof NextResponse) redirect("/login");
  if (
    !ctx.organizationId ||
    !ctx.userPermissions.canViewPatients ||
    !(
      ctx.userPermissions.canManageWhatsAppTemplates ||
      ctx.userPermissions.canSendWhatsAppCampaigns
    )
  )
    return (
      <div className="glass-card" dir="rtl">
        <EmptyState
          icon={<ShieldCheck />}
          title="ليس لديك صلاحية إدارة رسائل الصيدلية"
          hint="اطلب من المدير منح صلاحية القوالب أو مراسلة العملاء."
        />
      </div>
    );
  return <WhatsAppManager />;
}
