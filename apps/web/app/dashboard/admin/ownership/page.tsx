export const dynamic = "force-dynamic";

import { prisma } from "@/app/lib/prisma";
import { settleOwnership } from "@/app/lib/actions/ownership";

// N20 transition (SUPER_ADMIN only, guarded by the admin layout and the action):
// legacy insurance companies and discounts with no owning organisation are
// hidden from every organisation until they are settled here.
export default async function OwnershipPage() {
    const [companies, discounts, organizations] = await Promise.all([
        prisma.insuranceCompany.findMany({
            where: { organizationId: null, isPlatformShared: false },
            select: { id: true, name: true, policies: { select: { patient: { select: { branch: { select: { organizationId: true } } } } } } },
            orderBy: { name: "asc" },
        }),
        prisma.discount.findMany({
            where: { organizationId: null, isPlatformShared: false },
            select: { id: true, name: true, code: true },
            orderBy: { createdAt: "desc" },
        }),
        prisma.organization.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);

    // Evidence, not a guess: suggest an organisation only when every policy of
    // the company belongs to that organisation's patients. The admin confirms.
    const suggestion = (policies: { patient: { branch: { organizationId: string } | null } }[]) => {
        const orgs = new Set(policies.map(p => p.patient.branch?.organizationId ?? ""));
        return orgs.size === 1 && !orgs.has("") ? Array.from(orgs)[0] : "";
    };

    const row = (kind: "insurance" | "discount", id: string, label: string, suggested: string) => (
        <form key={id} action={settleOwnership} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <span className="min-w-48 flex-1 text-foreground">{label}</span>
            <select name="target" defaultValue={suggested} required className="rounded-md border border-border bg-background px-2 py-1">
                <option value="" disabled>اختر المالك…</option>
                <option value="shared">سجل عام للمنصة (يراه الجميع)</option>
                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}{o.id === suggested ? " (مقترح)" : ""}</option>)}
            </select>
            <button type="submit" className="rounded-md bg-primary px-3 py-1 text-primary-foreground">حفظ</button>
        </form>
    );

    return (
        <div className="w-full max-w-4xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground">تسوية ملكية السجلات القديمة</h1>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
                شركات تأمين وعروض أُنشئت قبل ربطها بالمؤسسات. لا تظهر لأي مؤسسة ولا يعدّلها مديروها حتى تُسند لمؤسستها أو تُعتمد سجلاً عاماً.
            </p>
            <h2 className="text-lg font-semibold mb-2">شركات التأمين ({companies.length})</h2>
            {companies.map(c => row("insurance", c.id, c.name, suggestion(c.policies)))}
            <h2 className="text-lg font-semibold mt-8 mb-2">العروض ({discounts.length})</h2>
            {discounts.map(d => row("discount", d.id, d.code ? `${d.name} — ${d.code}` : d.name, ""))}
        </div>
    );
}
