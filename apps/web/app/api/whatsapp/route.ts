export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext, TenantContext } from "@/app/lib/tenant-utils";
import { logAudit } from "@/app/lib/audit";
import {
  WaError,
  templateParts,
  templateSchema,
} from "@/app/lib/whatsapp/domain";
import {
  campaign,
  connection,
  createCampaign,
  resolveAttempt,
  getTemplate,
  org,
  patient,
  prepare,
  setConsent,
  templates,
} from "@/app/lib/whatsapp/store";
import { graph } from "@/app/lib/whatsapp/provider";
import { classifyWhatsAppFailure } from "@/app/lib/whatsapp/failure";
import {
  walletSummary,
  releaseCancelledCharges,
} from "@/app/lib/whatsapp/billing";

function permit(
  ctx: TenantContext,
  key: "canSendWhatsAppCampaigns" | "canManageWhatsAppTemplates",
) {
  if (!ctx.userPermissions.canViewPatients || !ctx.userPermissions[key])
    throw new WaError("ليس لديك صلاحية لهذا الإجراء.", 403);
  return org(ctx);
}
function failure(e: unknown) {
  if (e instanceof WaError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof z.ZodError)
    return NextResponse.json(
      { error: "البيانات المدخلة غير صالحة." },
      { status: 400 },
    );
  // No tokens, provider bodies, message contents or patient details in logs.
  const classified = classifyWhatsAppFailure(e);
  console.error("[WhatsApp] request failed", {
    code: classified.code,
    prismaCode: classified.prismaCode,
    sqlState: classified.sqlState,
  });
  return NextResponse.json(
    { error: classified.error, code: classified.code },
    { status: 503 },
  );
}
export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext("read");
    if (ctx instanceof NextResponse) return ctx;
    if (
      !ctx.userPermissions.canViewPatients ||
      !(
        ctx.userPermissions.canSendWhatsAppCampaigns ||
        ctx.userPermissions.canManageWhatsAppTemplates
      )
    )
      throw new WaError("غير مصرح.", 403);
    const organizationId = org(ctx),
      id = req.nextUrl.searchParams.get("campaignId");
    if (id) {
      await campaign(prisma, ctx, z.string().uuid().parse(id));
      const messages =
        await prisma.$queryRaw`SELECT id,name,phone,text,status,error,"providerId" FROM "public"."WaMessage" WHERE "campaignId"=${id} AND "organizationId"=${organizationId} ORDER BY name`;
      return NextResponse.json({ messages });
    }
    const campaigns =
      await prisma.$queryRaw`SELECT c.*, (SELECT COUNT(*)::int FROM "public"."WaMessage" m WHERE m."campaignId"=c.id) AS count FROM "public"."WaCampaign" c WHERE "organizationId"=${organizationId} AND (${["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(ctx.user.role)} OR "branchId"=${ctx.user.branchId ?? ""}) ORDER BY "createdAt" DESC LIMIT 50`;
    const rows = await prisma.$queryRaw<
      any[]
    >`SELECT mode,state,"billingVerifiedAt" FROM "public"."WaConnection" WHERE "organizationId"=${organizationId}`;
    return NextResponse.json({
      templates: await templates(prisma, organizationId),
      campaigns,
      wallet: ["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(ctx.user.role)
        ? await walletSummary(prisma, organizationId)
        : null,
      connection: {
        configured: !!rows[0],
        mode: rows[0]?.mode,
        state: rows[0]?.state,
        billingReady: !!rows[0]?.billingVerifiedAt,
      },
      sendEnabled: process.env.WHATSAPP_SEND_ENABLED === "true",
      permissions: {
        send: ctx.userPermissions.canSendWhatsAppCampaigns,
        manage: ctx.userPermissions.canManageWhatsAppTemplates,
        connect: false,
        inbox:
          ["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(ctx.user.role) &&
          ctx.userPermissions.canSendWhatsAppCampaigns,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext("write");
    if (ctx instanceof NextResponse) return ctx;
    const text = await req.text();
    if (text.length > 80000) throw new WaError("حجم الطلب أكبر من المسموح.");
    let raw: any;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new WaError("طلب غير صالح.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new WaError("طلب غير صالح.");
    const { action } = raw;
    if (action === "connection")
      throw new WaError(
        "إعداد الاتصال متاح من إدارة المؤسسات في لوحة مدير المنصة فقط.",
        403,
      );
    const organizationId = permit(
      ctx,
      ["template", "submit", "sync"].includes(action)
        ? "canManageWhatsAppTemplates"
        : "canSendWhatsAppCampaigns",
    );
    let result: unknown;
    if (action === "template") {
      const t = templateSchema.parse(raw);
      templateParts(t.body);
      const id = randomUUID();
      await prisma.$executeRaw`INSERT INTO "public"."WaTemplateVersion" (id,"organizationId",name,body,language,category,status,"createdAt") VALUES (${id},${organizationId},${t.name},${t.body},${t.language},${t.category},'DRAFT',NOW())`;
      result = { id };
    } else if (action === "submit" || action === "sync") {
      const id = z.string().uuid().parse(raw.id),
        t = await getTemplate(prisma, id, organizationId),
        c = await connection(prisma, organizationId);
      if (!c) throw new WaError("هيئ اتصال الصيدلية أولًا.");
      const metaName = t.metaName ?? `faramace_${id.replaceAll("-", "")}`;
      if (action === "submit") {
        const changed =
          await prisma.$executeRaw`UPDATE "public"."WaTemplateVersion" SET status='SUBMITTING',"metaName"=${metaName} WHERE id=${id} AND "organizationId"=${organizationId} AND status='DRAFT'`;
        if (!changed)
          throw new WaError(
            "سبقت محاولة اعتماد هذه النسخة؛ حدّث حالتها بدل تكرار الإنشاء.",
            409,
          );
        // Persist before the external call; an uncertain result is resolved by name.
        const body = templateParts(t.body).metaBody;
        const names = templateParts(t.body).names;
        const examples = names.map((n) =>
          n === "اسم_العميل"
            ? "أحمد"
            : n === "اسم_الصيدلية"
              ? "الصيدلية"
              : "قيمة توضيحية",
        );
        const response = await graph(c, `${c.businessId}/message_templates`, {
          name: metaName,
          language: t.language,
          category: t.category,
          components: [
            {
              type: "BODY",
              text: body,
              ...(examples.length
                ? { example: { body_text: [examples] } }
                : {}),
            },
          ],
        });
        await prisma.$executeRaw`UPDATE "public"."WaTemplateVersion" SET "metaId"=${String(response.id)},status='PENDING' WHERE id=${id} AND "organizationId"=${organizationId}`;
      } else {
        if (!t.metaName) throw new WaError("لم تُرسل هذه النسخة للاعتماد.");
        const response = await graph(
          c,
          `${c.businessId}/message_templates?name=${encodeURIComponent(metaName)}&fields=id,name,status,category,language,components&limit=100`,
        );
        const found = response.data?.find(
          (r: any) => r.name === metaName && r.language === t.language,
        );
        if (!found)
          throw new WaError(
            "لم يظهر القالب لدى Meta بعد؛ أبقِ النسخة وأعد التحقق لاحقًا.",
            409,
          );
        if (
          found.components?.find((p: any) => p.type === "BODY")?.text !==
          templateParts(t.body).metaBody
        )
          throw new WaError("نص القالب لدى Meta لا يطابق النسخة المحلية.", 409);
        const status = String(found.status);
        const category = String(found.category);
        if (!["MARKETING", "UTILITY"].includes(category))
          throw new WaError(
            "تصنيف القالب لدى Meta غير مدعوم لهذه الخدمة.",
            409,
          );
        if (
          ![
            "APPROVED",
            "PENDING",
            "REJECTED",
            "PAUSED",
            "DISABLED",
            "IN_APPEAL",
          ].includes(status)
        )
          throw new WaError("حالة القالب غير معروفة.", 409);
        await prisma.$executeRaw`UPDATE "public"."WaTemplateVersion" SET "metaId"=${String(found.id)},status=${status},category=${category} WHERE id=${id} AND "organizationId"=${organizationId}`;
      }
      result = { ok: true };
    } else if (action === "consent") {
      if (!ctx.userPermissions.canEditPatient)
        throw new WaError("تسجيل الموافقة يتطلب صلاحية تعديل المريض.", 403);
      const input = z
        .object({
          patientId: z.string().uuid(),
          allowed: z.boolean(),
          evidence: z.string().trim().min(5).max(500),
        })
        .parse(raw);
      await setConsent(
        prisma,
        ctx,
        input.patientId,
        input.allowed,
        input.evidence,
      );
      result = { ok: true };
    } else if (action === "preview") {
      const p = await prepare(prisma, ctx, raw);
      result = {
        hash: p.hash,
        count: p.recipients.length,
        recipients: p.recipients.slice(0, 5),
        excluded: p.excluded,
        pricing: p.pricing,
        scheduledAt: p.scheduledAt,
      };
    } else if (action === "create") {
      if (process.env.WHATSAPP_SEND_ENABLED !== "true")
        throw new WaError(
          "الإرسال الفعلي غير مفعّل على الخادم؛ المعاينة متاحة.",
          503,
        );
      if (!(await connection(prisma, organizationId)))
        throw new WaError("اتصال WhatsApp غير مهيأ.");
      const input = z
        .object({
          id: z.string().uuid(),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          name: z.string().trim().min(2).max(100),
        })
        .parse(raw);
      result = await createCampaign(
        prisma,
        ctx,
        raw,
        input.id,
        input.hash,
        input.name,
      );
    } else if (action === "resume") {
      if (process.env.WHATSAPP_SEND_ENABLED !== "true")
        throw new WaError("الإرسال الفعلي غير مفعّل على الخادم.", 503);
      const id = z.string().uuid().parse(raw.id);
      await campaign(prisma, ctx, id);
      await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { status: string }[]
        >`SELECT status FROM "public"."WaCampaign" WHERE id=${id} AND "organizationId"=${organizationId} FOR UPDATE`;
        if (rows[0]?.status === "CANCELLED")
          throw new WaError("الحملة موقوفة؛ لا يمكن استئنافها.", 409);
        // BLOCKED means the provider send was never attempted. UNKNOWN/FAILED
        // must never be requeued by a generic retry button.
        const changed =
          await tx.$executeRaw`UPDATE "public"."WaMessage" SET status='QUEUED',error=NULL,"claimedAt"=NULL,"updatedAt"=NOW() WHERE "campaignId"=${id} AND "organizationId"=${organizationId} AND status='BLOCKED'`;
        if (!changed)
          throw new WaError(
            "لا توجد رسائل متوقفة قبل الإرسال يمكن استئنافها.",
            409,
          );
        await tx.$executeRaw`UPDATE "public"."WaCampaign" SET status='QUEUED' WHERE id=${id} AND "organizationId"=${organizationId}`;
      });
      result = { ok: true };
    } else if (action === "resolve") {
      result = await resolveAttempt(
        prisma,
        ctx,
        z.string().uuid().parse(raw.id),
      );
    } else if (action === "cancel") {
      const id = z.string().uuid().parse(raw.id);
      await campaign(prisma, ctx, id);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "public"."WaCampaign" SET status='CANCELLED' WHERE id=${id} AND "organizationId"=${organizationId}`;
        const stopped = await tx.$queryRaw<
          { id: string }[]
        >`UPDATE "public"."WaMessage" SET status='CANCELLED',error='أوقفت الحملة قبل إرسال هذه الرسالة',"updatedAt"=NOW() WHERE "campaignId"=${id} AND "organizationId"=${organizationId} AND status IN ('QUEUED','BLOCKED') RETURNING id`;
        await releaseCancelledCharges(
          tx,
          organizationId,
          stopped.map((m) => m.id),
        );
      });
      result = { ok: true };
    } else throw new WaError("إجراء غير معروف.");
    if (action !== "preview")
      await logAudit({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "",
        action: `WHATSAPP_${action.toUpperCase()}`,
        entity: "WhatsApp",
        details: JSON.stringify({
          organizationId,
          id: raw.id ?? raw.patientId ?? null,
        }),
        branchId: ctx.user.branchId,
      });
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
