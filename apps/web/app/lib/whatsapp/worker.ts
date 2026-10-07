import { PrismaClient } from "@prisma/client";
import {
  connection,
  getTemplate,
  Message,
  Campaign,
  refreshCampaign,
} from "./store";
import { graph, sendTemplate } from "./provider";
import { getUserPermissions } from "../permissions";
import { getSubscriptionState } from "../subscription-state";
import { normalizePhone, templateParts, WaError } from "./domain";
import { assertFundedMessage, settleCharge } from "./billing";
import { drainWebhooks } from "./webhook";
import { verifyPlatformFunding } from "./platform";

/** Claims are persisted before sending. Crashes and lost answers never requeue a send. */
export async function runQueue(db: PrismaClient, limit = 4) {
  const webhooksProcessed = await drainWebhooks(db);
  if (process.env.WHATSAPP_SEND_ENABLED !== "true")
    return { enabled: false, processed: 0, webhooksProcessed };
  const touched = new Map<string, string>();
  const expired = await db.$queryRaw<
    { campaignId: string; organizationId: string }[]
  >`WITH stale AS (SELECT id FROM "public"."WaMessage" WHERE status='SENDING' AND "claimedAt" < NOW()-INTERVAL '10 minutes' ORDER BY "claimedAt" FOR UPDATE SKIP LOCKED LIMIT 8) UPDATE "public"."WaMessage" m SET status='UNKNOWN',error='انتهت مهلة متابعة الإرسال؛ لا تعد الإرسال قبل حسم النتيجة',"updatedAt"=NOW() FROM stale WHERE m.id=stale.id RETURNING m."campaignId",m."organizationId"`;
  for (const m of expired) touched.set(m.campaignId, m.organizationId);
  let processed = 0;
  const step = async () => {
    const rows = await db.$queryRaw<
      Message[]
    >`WITH candidate AS (SELECT m.id FROM "public"."WaMessage" m JOIN "public"."WaCampaign" c ON c.id=m."campaignId" WHERE m.status='QUEUED' AND c.status='QUEUED' AND (c."scheduledAt" IS NULL OR c."scheduledAt" <= NOW()) ORDER BY c."createdAt",m.id FOR UPDATE OF m SKIP LOCKED LIMIT 1) UPDATE "public"."WaMessage" m SET status='SENDING',"claimedAt"=NOW(),"updatedAt"=NOW() FROM candidate WHERE m.id=candidate.id RETURNING m.*`;
    const m = rows[0];
    if (!m) return;
    touched.set(m.campaignId, m.organizationId);
    processed++;
    let submitted = false;
    try {
      const campaigns = await db.$queryRaw<
        Campaign[]
      >`SELECT * FROM "public"."WaCampaign" WHERE id=${m.campaignId} AND "organizationId"=${m.organizationId}`;
      const c = campaigns[0];
      if (!c || c.status !== "QUEUED") throw new WaError("الحملة متوقفة.");
      const creator = await db.user.findUnique({
        where: { id: c.createdBy },
        include: { branch: { include: { organization: true } } },
      });
      const permissions = creator ? getUserPermissions(creator) : null;
      if (
        !creator?.isActive ||
        creator.branch?.organizationId !== m.organizationId ||
        !permissions?.canSendWhatsAppCampaigns ||
        !permissions.canViewPatients ||
        !["active", "warning"].includes(
          getSubscriptionState(creator.branch.organization).state,
        )
      )
        throw new WaError(
          "لم يعد منشئ الحملة مخولًا للإرسال أو أن اشتراك المؤسسة غير نشط.",
        );
      const ownBranch = ["ADMIN", "MANAGER", "SUPER_ADMIN"].includes(
        creator.role,
      )
        ? undefined
        : (creator.branchId ?? "");
      const p = await db.patient.findFirst({
        where: {
          id: m.patientId,
          branch: { organizationId: m.organizationId },
          ...(ownBranch ? { branchId: ownBranch } : {}),
        },
        select: { phone: true },
      });
      if (!p || normalizePhone(p.phone) !== m.phone)
        throw new WaError("تغيّر سجل المستلم أو خرج من النطاق.");
      const consent = await db.$queryRaw<
        { allowed: boolean }[]
      >`SELECT allowed FROM "public"."WaConsent" WHERE "organizationId"=${m.organizationId} AND phone=${m.phone}`;
      if (!consent[0]?.allowed)
        throw new WaError("ألغى المستلم الموافقة أو لم تعد متاحة.");
      const t = await getTemplate(db, c.templateId, m.organizationId),
        conn = await connection(db, m.organizationId);
      if (!conn || !t.metaName)
        throw new WaError("الاتصال أو القالب غير مهيأ.");
      if (
        conn.state !== "ACTIVE" ||
        !conn.allocationId ||
        !conn.fundingId ||
        !conn.billingVerifiedAt
      )
        throw new WaError(
          "الإرسال متوقف حتى يثبت مدير المنصة الفوترة المركزية أو يعيد ربط الرقم.",
        );
      await assertFundedMessage(db, m.organizationId, m.id);
      // Verify the current provider funding, not just a locally saved checkbox.
      const fundingId = await verifyPlatformFunding(conn, conn.allocationId);
      if (fundingId !== conn.fundingId)
        throw new WaError("تغيّرت جهة فوترة Meta؛ راجع مدير المنصة.");
      const info = await graph(
        conn,
        `${conn.businessId}/message_templates?name=${encodeURIComponent(t.metaName)}&fields=name,status,language,components&limit=100`,
      );
      const approved = info.data?.find(
        (x: any) => x.name === t.metaName && x.language === t.language,
      );
      if (
        approved?.status !== "APPROVED" ||
        approved.components?.find((x: any) => x.type === "BODY")?.text !==
          templateParts(t.body).metaBody
      )
        throw new WaError("القالب غير معتمد حاليًا أو تغيّر نصه لدى Meta.");
      // Recheck cancellation/opt-out just before the external call.
      const eligible = await db.$queryRaw<
        { ok: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM "public"."WaCampaign" c JOIN "public"."WaConsent" w ON w."organizationId"=c."organizationId" JOIN "public"."WaConnection" a ON a."organizationId"=c."organizationId" WHERE c.id=${c.id} AND c.status='QUEUED' AND w.phone=${m.phone} AND w.allowed AND a.state='ACTIVE' AND a."phoneId"=${conn.phoneId} AND a."businessId"=${conn.businessId} AND a."allocationId"=${conn.allocationId} AND a."fundingId"=${fundingId} AND a."billingVerifiedAt" IS NOT NULL) AS ok`;
      if (!eligible[0]?.ok)
        throw new WaError("أوقفت الحملة أو أُلغي الاشتراك.");
      submitted = true;
      const providerId = await sendTemplate(conn, {
        id: m.id,
        phone: m.phone,
        metaName: t.metaName,
        language: t.language,
        parameters: m.parameters,
      });
      await db.$executeRaw`UPDATE "public"."WaMessage" SET "providerId"=${providerId},status=CASE WHEN status IN ('SENDING','UNKNOWN') THEN 'SENT' ELSE status END,error=CASE WHEN status IN ('SENDING','UNKNOWN') THEN NULL ELSE error END,"updatedAt"=NOW() WHERE id=${m.id} AND "organizationId"=${m.organizationId}`;
    } catch (e) {
      const uncertain =
        submitted && (!(e instanceof WaError) || (e as any).ambiguous === true);
      const status = uncertain ? "UNKNOWN" : submitted ? "FAILED" : "BLOCKED";
      const reason = uncertain
        ? "نتيجة إرسال غير مؤكدة؛ انتظر إشعار WhatsApp ولا تعِد الإرسال"
        : e instanceof WaError
          ? e.message
          : "تعذر التحقق قبل الإرسال؛ لم يُرسل طلب الرسالة";
      await db.$transaction(async (tx) => {
        const changed = await tx.$queryRaw<
          { id: string }[]
        >`UPDATE "public"."WaMessage" SET status=${status},error=${reason},"updatedAt"=NOW() WHERE id=${m.id} AND status='SENDING' RETURNING id`;
        if (changed.length && status === "FAILED")
          await settleCharge(tx, m.organizationId, m.id, "FAILED");
      });
    }
  };
  // Two messages at once; four per invocation keeps work bounded on Vercel.
  const budget = Math.max(0, Math.min(Math.floor(limit), 4));
  for (let i = 0; i < budget; i += 2)
    await Promise.all(
      Array.from({ length: Math.min(2, budget - i) }, () => step()),
    );
  for (const [id, organizationId] of Array.from(touched))
    await db.$transaction((tx) => refreshCampaign(tx, id, organizationId));
  return { enabled: true, processed, webhooksProcessed };
}
