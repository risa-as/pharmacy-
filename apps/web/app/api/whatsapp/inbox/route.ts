import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";
import { normalizePhone, unseal, WaError } from "@/app/lib/whatsapp/domain";
import { org } from "@/app/lib/whatsapp/store";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext("read");
    if (ctx instanceof NextResponse) return ctx;
    if (
      !["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(ctx.user.role) ||
      !ctx.userPermissions.canViewPatients ||
      !ctx.userPermissions.canSendWhatsAppCampaigns
    )
      throw new WaError(
        "المحادثات متاحة لمدير المؤسسة المخول بمراسلة العملاء فقط.",
        403,
      );
    const organizationId = org(ctx),
      raw = req.nextUrl.searchParams.get("phone"),
      phone = raw ? normalizePhone(raw) : null;
    if (raw && !phone) throw new WaError("رقم غير صالح.");
    const beforeRaw = req.nextUrl.searchParams.get("before"),
      before = beforeRaw ? new Date(beforeRaw) : null,
      beforeId = req.nextUrl.searchParams.get("beforeId");
    if (
      before &&
      (!Number.isFinite(before.getTime()) || !beforeId || beforeId.length > 300)
    )
      throw new WaError("مؤشر القراءة غير صالح.");
    const source = Prisma.sql`SELECT "providerId",phone,direction,source,"contentEncrypted",NULL::text AS text,"sentAt" FROM "public"."WaInboxMessage" WHERE "organizationId"=${organizationId} UNION ALL SELECT "providerId",phone,'OUT','API',NULL::text,text,"updatedAt" FROM "public"."WaMessage" m WHERE "organizationId"=${organizationId} AND "providerId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "public"."WaInboxMessage" i WHERE i."organizationId"=${organizationId} AND i."providerId"=m."providerId")`;
    if (!phone) {
      const threads = await prisma.$queryRaw<any[]>(
        Prisma.sql`SELECT phone,MAX("sentAt") AS "lastAt" FROM (${source}) x GROUP BY phone ORDER BY "lastAt" DESC LIMIT 100`,
      );
      return NextResponse.json(
        { threads },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const rows = await prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT * FROM (${source}) x WHERE phone=${phone} ${before ? Prisma.sql`AND ("sentAt"<${before} OR ("sentAt"=${before} AND "providerId"<${beforeId}))` : Prisma.empty} ORDER BY "sentAt" DESC,"providerId" DESC LIMIT 101`,
    );
    const messages = rows
      .slice(0, 100)
      .map((m) => ({
        id: m.providerId,
        phone: m.phone,
        direction: m.direction,
        source: m.source,
        sentAt: m.sentAt,
        ...(m.contentEncrypted
          ? JSON.parse(unseal(m.contentEncrypted))
          : { type: "text", body: m.text }),
      }));
    return NextResponse.json(
      {
        messages,
        nextBefore:
          rows.length > 100 ? messages[messages.length - 1].sentAt : null,
        nextId: rows.length > 100 ? messages[messages.length - 1].id : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof WaError ? e.message : "تعذر تحميل المحادثات." },
      { status: e instanceof WaError ? e.status : 503 },
    );
  }
}
