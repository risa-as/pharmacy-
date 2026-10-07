import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { WaError } from "@/app/lib/whatsapp/domain";
import { graph } from "@/app/lib/whatsapp/provider";
import { saveConnection } from "@/app/lib/whatsapp/store";
import { classifyWhatsAppFailure } from "@/app/lib/whatsapp/failure";
import { assertNoPendingMessages } from "@/app/lib/whatsapp/coexistence";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const inputSchema = z
  .object({
    phoneId: z.string().regex(/^\d{5,30}$/),
    businessId: z.string().regex(/^\d{5,30}$/),
    token: z.string().min(20).max(4000),
    appSecret: z.string().min(16).max(200),
    revision: z.string().datetime().nullable(),
  })
  .strict();
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function administrator() {
  const session = await auth();
  if (!session?.user?.id || (session as any).error)
    throw new WaError("سجّل الدخول أولًا.", 401);
  if (session.user.role !== "SUPER_ADMIN")
    throw new WaError("إعداد الاتصال متاح لمدير المنصة فقط.", 403);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive || user.role !== "SUPER_ADMIN")
    throw new WaError("إعداد الاتصال متاح لمدير المنصة فقط.", 403);
  return user;
}
async function organization(ctx: Context) {
  const { id } = await ctx.params;
  const found = await prisma.organization.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!found) throw new WaError("المؤسسة غير موجودة.", 404);
  return id;
}
function failure(error: unknown) {
  if (error instanceof WaError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json({ error: "بيانات الاتصال غير صالحة." }, 400);
  const e = error as { code?: string; meta?: { code?: string } };
  if (e?.code === "P2002" || (e?.code === "P2010" && e.meta?.code === "23505"))
    return json(
      { error: "الرقم مرتبط بمؤسسة أخرى؛ راجع الربط قبل تغييره." },
      409,
    );
  const classified = classifyWhatsAppFailure(error);
  // Never log credentials or the provider response.
  console.error("[WhatsApp admin] request failed", { code: classified.code });
  return json({ error: classified.error, code: classified.code }, 503);
}
export async function GET(_req: NextRequest, ctx: Context) {
  try {
    await administrator();
    const id = await organization(ctx);
    const rows = await prisma.$queryRaw<
      { phoneId: string; businessId: string; updatedAt: Date }[]
    >`
      SELECT "phoneId","businessId","updatedAt" FROM "public"."WaConnection" WHERE "organizationId"=${id}`;
    return json({
      connection: rows[0] ?? null,
      webhookPath: `/api/whatsapp/webhook/${id}`,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(req: NextRequest, ctx: Context) {
  try {
    const user = await administrator();
    const id = await organization(ctx);
    const text = await req.text();
    if (text.length > 8000) throw new WaError("حجم الطلب أكبر من المسموح.");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new WaError("طلب غير صالح.");
    }
    const data = inputSchema.parse(raw);
    const phones = await graph(
      { ...data, organizationId: id, verifyToken: "" },
      `${data.businessId}/phone_numbers?fields=id&limit=100`,
    );
    if (!phones.data?.some((p: { id: string }) => p.id === data.phoneId))
      throw new WaError("الرقم لا يتبع حساب WhatsApp Business المحدد.");
    const result = await prisma.$transaction(async (tx) => {
      // Serializes creation too, when there is no row yet to lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wa-connection:${id}`},0))`;
      const rows = await tx.$queryRaw<{ updatedAt: Date }[]>`
        SELECT "updatedAt" FROM "public"."WaConnection" WHERE "organizationId"=${id} FOR UPDATE`;
      if ((rows[0]?.updatedAt.toISOString() ?? null) !== data.revision)
        throw new WaError(
          "تغيّر الاتصال منذ فتح النموذج؛ حدّث حالته ثم راجع البيانات.",
          409,
        );
      await assertNoPendingMessages(tx, id);
      const verifyToken = await saveConnection(tx, id, data);
      await tx.$executeRaw`UPDATE "public"."WaConnection" SET mode='MANUAL',state='ACTIVE',"allocationId"=NULL,"fundingId"=NULL,"billingVerifiedAt"=NULL,"disconnectedAt"=NULL WHERE "organizationId"=${id}`;
      // The timestamp is also the edit revision; ensure rapid saves cannot
      // reuse the same millisecond and accidentally accept a stale form.
      if (rows[0]) {
        const nextRevision = new Date(rows[0].updatedAt.getTime() + 1);
        await tx.$executeRaw`UPDATE "public"."WaConnection" SET "updatedAt"=GREATEST("updatedAt",${nextRevision}::timestamp) WHERE "organizationId"=${id}`;
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name ?? "",
          action: "WHATSAPP_CONNECTION_UPDATE",
          entity: "WhatsApp",
          entityId: id,
          details: JSON.stringify({
            organizationId: id,
            phoneId: data.phoneId,
            businessId: data.businessId,
            credentialsUpdated: true,
          }),
        },
      });
      const updated = await tx.$queryRaw<{ updatedAt: Date }[]>`
        SELECT "updatedAt" FROM "public"."WaConnection" WHERE "organizationId"=${id}`;
      return { verifyToken, revision: updated[0].updatedAt.toISOString() };
    });
    return json({ ...result, webhookPath: `/api/whatsapp/webhook/${id}` });
  } catch (error) {
    return failure(error);
  }
}
