import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import {
  whatsappAdministrator,
  whatsappOrganization,
} from "@/app/lib/whatsapp/admin";
import { creditWallet, walletSummary } from "@/app/lib/whatsapp/billing";
import { connection } from "@/app/lib/whatsapp/store";
import { verifyPlatformFunding } from "@/app/lib/whatsapp/platform";
import { WaError } from "@/app/lib/whatsapp/domain";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function fail(e: unknown) {
  return json(
    {
      error:
        e instanceof WaError
          ? e.message
          : e instanceof z.ZodError
            ? "بيانات الفوترة غير صالحة."
            : "تعذر إكمال طلب الفوترة؛ راجع إعداد الخدمة.",
    },
    e instanceof WaError ? e.status : e instanceof z.ZodError ? 400 : 503,
  );
}
export async function GET(_req: NextRequest, ctx: Context) {
  try {
    await whatsappAdministrator();
    const id = await whatsappOrganization((await ctx.params).id);
    const rows = await prisma.$queryRaw<
      any[]
    >`SELECT mode,state,"allocationId","billingVerifiedAt","contactsSyncState","historySyncState","contactsSyncRequestId","historySyncRequestId" FROM "public"."WaConnection" WHERE "organizationId"=${id}`;
    const queue = await prisma.$queryRaw<
      { pending: number; review: number }[]
    >`SELECT COUNT(*) FILTER (WHERE state IN ('QUEUED','PROCESSING'))::int AS pending,COUNT(*) FILTER (WHERE state='NEEDS_REVIEW')::int AS review FROM "public"."WaWebhookEvent" WHERE "organizationId"=${id}`;
    return json({
      wallet: await walletSummary(prisma, id),
      connection: rows[0] ?? null,
      webhookQueue: queue[0],
      billingConfigured: !!(
        process.env.WHATSAPP_META_SYSTEM_TOKEN &&
        process.env.WHATSAPP_META_CREDIT_LINE_ID
      ),
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const user = await whatsappAdministrator(),
      id = await whatsappOrganization((await ctx.params).id);
    const text = await req.text();
    if (text.length > 4000) throw new WaError("الطلب أكبر من المسموح.");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new WaError("طلب غير صالح.");
    }
    const data = z
      .discriminatedUnion("action", [
        z
          .object({
            action: z.literal("credit"),
            id: z.string().uuid(),
            amountIqd: z.number().int().positive().max(1000000000),
            reference: z.string().trim().min(3).max(200),
          })
          .strict(),
        z
          .object({
            action: z.literal("verify"),
            allocationId: z.string().regex(/^\d{5,30}$/),
          })
          .strict(),
      ])
      .parse(raw);
    if (data.action === "credit")
      return json({ wallet: await creditWallet(prisma, id, user, data) });
    const conn = await connection(prisma, id);
    if (!conn) throw new WaError("اربط رقم المؤسسة أولًا.", 409);
    const fundingId = await verifyPlatformFunding(conn, data.allocationId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-connection:" + id},0))`;
      const current = await connection(tx, id);
      if (
        !current ||
        current.phoneId !== conn.phoneId ||
        current.businessId !== conn.businessId ||
        current.token !== conn.token ||
        current.state === "DISCONNECTED"
      )
        throw new WaError("تغير الاتصال أو فُصل؛ حدّث الصفحة قبل التحقق.", 409);
      await tx.$executeRaw`UPDATE "public"."WaConnection" SET "allocationId"=${data.allocationId},"fundingId"=${fundingId},"billingVerifiedAt"=NOW() WHERE "organizationId"=${id}`;
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name ?? "",
          action: "WHATSAPP_BILLING_VERIFY",
          entity: "WhatsApp",
          entityId: id,
          details: JSON.stringify({
            organizationId: id,
            allocationId: data.allocationId,
          }),
        },
      });
    });
    return json({ verified: true });
  } catch (e) {
    return fail(e);
  }
}
