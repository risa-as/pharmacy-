import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  WaError,
  fingerprint,
  normalizePhone,
  previewSchema,
  renderTemplate,
  seal,
  unseal,
} from "./domain";
import type { TenantContext } from "../tenant-utils";
import type { Connection } from "./provider";
import { readWhatsAppPricing, WA_PRICING_LOCK } from "./pricing-store";
import { quoteWhatsAppCampaign } from "./pricing";
import { validateSchedule } from "./schedule";
import { reserveCampaign } from "./billing";
export type Db = PrismaClient | Prisma.TransactionClient;
export type Template = {
  id: string;
  organizationId: string;
  name: string;
  body: string;
  language: string;
  category: string;
  status: string;
  metaId: string | null;
  metaName: string | null;
  createdAt: Date;
};
export type Campaign = {
  id: string;
  organizationId: string;
  branchId: string | null;
  createdBy: string;
  templateId: string;
  name: string;
  previewHash: string;
  scheduledAt: Date | null;
  status: string;
  createdAt: Date;
};
export type Message = {
  id: string;
  campaignId: string;
  organizationId: string;
  patientId: string;
  phone: string;
  name: string;
  text: string;
  parameters: string[];
  status: string;
  providerId: string | null;
  error: string | null;
};
export function org(ctx: TenantContext) {
  if (!ctx.organizationId)
    throw new WaError("اختر حساب صيدلية مرتبطًا بمؤسسة لإدارة رسائلها.", 403);
  return ctx.organizationId;
}
export async function connection(
  db: Db,
  id: string,
): Promise<Connection | null> {
  const rows = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaConnection" WHERE "organizationId"=${id}`;
  if (!rows.length) return null;
  const c = rows[0];
  return {
    organizationId: id,
    phoneId: c.phoneId,
    businessId: c.businessId,
    token: unseal(c.tokenEncrypted),
    appSecret: unseal(c.secretEncrypted),
    verifyToken: unseal(c.verifyEncrypted),
    mode: c.mode,
    state: c.state,
    allocationId: c.allocationId,
    fundingId: c.fundingId,
    billingVerifiedAt: c.billingVerifiedAt,
  };
}
export async function saveConnection(
  db: Db,
  id: string,
  input: {
    phoneId: string;
    businessId: string;
    token: string;
    appSecret: string;
  },
) {
  const verifyToken = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaConnection" ("organizationId","phoneId","businessId","tokenEncrypted","secretEncrypted","verifyEncrypted","updatedAt") VALUES (${id},${input.phoneId},${input.businessId},${seal(input.token)},${seal(input.appSecret)},${seal(verifyToken)},NOW()) ON CONFLICT ("organizationId") DO UPDATE SET "phoneId"=EXCLUDED."phoneId","businessId"=EXCLUDED."businessId","tokenEncrypted"=EXCLUDED."tokenEncrypted","secretEncrypted"=EXCLUDED."secretEncrypted","verifyEncrypted"=EXCLUDED."verifyEncrypted","updatedAt"=NOW()`;
  return verifyToken;
}
export async function templates(db: Db, id: string) {
  return db.$queryRaw<
    Template[]
  >`SELECT * FROM "public"."WaTemplateVersion" WHERE "organizationId"=${id} ORDER BY "createdAt" DESC LIMIT 100`;
}
export async function getTemplate(db: Db, id: string, organizationId: string) {
  const rows = await db.$queryRaw<
    Template[]
  >`SELECT * FROM "public"."WaTemplateVersion" WHERE id=${id} AND "organizationId"=${organizationId}`;
  if (!rows[0]) throw new WaError("القالب غير موجود.", 404);
  return rows[0];
}
export async function patient(db: Db, ctx: TenantContext, id: string) {
  const p = await db.patient.findFirst({
    where: {
      AND: [
        { branch: { organizationId: org(ctx) } },
        ctx.tenantBranchWhere,
        { id },
      ],
    },
    select: { id: true, name: true, phone: true, branchId: true },
  });
  if (!p) throw new WaError("المستلم غير موجود ضمن نطاقك.", 404);
  return p;
}
export async function setConsent(
  db: Db,
  ctx: TenantContext,
  id: string,
  allowed: boolean,
  evidence: string,
) {
  const p = await patient(db, ctx, id);
  const phone = normalizePhone(p.phone);
  if (!phone) throw new WaError("رقم الهاتف غير صالح.");
  const organizationId = org(ctx);
  await db.$executeRaw`INSERT INTO "public"."WaConsent" ("organizationId",phone,allowed,evidence,"recordedBy","updatedAt") VALUES (${organizationId},${phone},${allowed},${evidence},${ctx.user.id},NOW()) ON CONFLICT ("organizationId",phone) DO UPDATE SET allowed=EXCLUDED.allowed,evidence=EXCLUDED.evidence,"recordedBy"=EXCLUDED."recordedBy","updatedAt"=NOW()`;
}
export async function prepare(db: Db, ctx: TenantContext, raw: unknown) {
  const input = previewSchema.parse(raw),
    organizationId = org(ctx),
    t = await getTemplate(db, input.templateId, organizationId);
  const scheduledAt = validateSchedule(input.scheduledAt);
  if (t.status !== "APPROVED" || !t.metaName)
    throw new WaError("اختر قالبًا معتمدًا لدى WhatsApp.");
  const where = {
    AND: [
      { branch: { organizationId } },
      ctx.tenantBranchWhere,
      ...(input.selection.branchId
        ? [{ branchId: input.selection.branchId }]
        : []),
      ...(input.selection.mode === "ids"
        ? [{ id: { in: input.selection.ids } }]
        : []),
      ...(input.selection.search
        ? [
            {
              OR: [
                {
                  name: {
                    contains: input.selection.search,
                    mode: "insensitive" as const,
                  },
                },
                { phone: { contains: input.selection.search } },
              ],
            },
          ]
        : []),
      { id: { notIn: input.selection.excludedIds } },
    ],
  };
  const people = await db.patient.findMany({
    where,
    select: { id: true, name: true, phone: true, branchId: true },
    orderBy: { id: "asc" },
    take: 1001,
  });
  if (people.length > 1000)
    throw new WaError("الحد الحالي للحملة 1000 شخص؛ ضيّق البحث.");
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  const phones = Array.from(
    new Set(
      people
        .map((p) => normalizePhone(p.phone))
        .filter((p): p is string => !!p),
    ),
  );
  const consent = phones.length
    ? await db.$queryRaw<
        { phone: string; allowed: boolean }[]
      >`SELECT phone,allowed FROM "public"."WaConsent" WHERE "organizationId"=${organizationId} AND phone IN (${Prisma.join(phones)})`
    : [];
  const allowed = new Set(consent.filter((c) => c.allowed).map((c) => c.phone)),
    seen = new Set<string>();
  const recipients: Array<{
      patientId: string;
      phone: string;
      name: string;
      text: string;
      parameters: string[];
    }> = [],
    excluded: Array<{ name: string; reason: string }> = [];
  for (const p of people) {
    const phone = normalizePhone(p.phone);
    const reason = !phone
      ? "رقم غير صالح"
      : !allowed.has(phone)
        ? "لا توجد موافقة على التواصل"
        : seen.has(phone)
          ? "رقم مكرر"
          : null;
    if (reason) {
      excluded.push({ name: p.name, reason });
      continue;
    }
    seen.add(phone!);
    recipients.push({
      patientId: p.id,
      phone: phone!,
      name: p.name,
      ...renderTemplate(t.body, p.name, organization?.name ?? "", input.values),
    });
  }
  const pricingPolicy = await readWhatsAppPricing(db);
  const pricing = pricingPolicy
    ? quoteWhatsAppCampaign(
        pricingPolicy,
        t.category,
        recipients.map((r) => r.phone),
      )
    : null;
  return {
    input,
    template: t,
    recipients,
    excluded,
    pricing,
    pricingPolicy,
    scheduledAt,
    // Preserve hashes of existing immediate attempts; scheduled requests include
    // the canonical instant, so changing the date requires a fresh preview.
    hash: fingerprint({
      template: t.id,
      recipients,
      pricing,
      pricingPolicy,
      ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
    }),
  };
}
export async function campaign(db: Db, ctx: TenantContext, id: string) {
  const rows = await db.$queryRaw<
    Campaign[]
  >`SELECT * FROM "public"."WaCampaign" WHERE id=${id} AND "organizationId"=${org(ctx)} AND (${ctx.user.role === "ADMIN" || ctx.user.role === "MANAGER" || ctx.user.role === "SUPER_ADMIN"} OR "branchId"=${ctx.user.branchId ?? ""})`;
  if (!rows[0]) throw new WaError("الحملة غير موجودة.", 404);
  return rows[0];
}
export async function createCampaign(
  db: PrismaClient,
  ctx: TenantContext,
  input: unknown,
  id: string,
  hash: string,
  name: string,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-attempt:" + id}::text,0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-campaign:" + org(ctx) + ":" + hash}::text,0))`;
      const attempt = await tx.$queryRaw<
        {
          organizationId: string;
          createdBy: string;
          previewHash: string;
          campaignId: string | null;
          status: string;
        }[]
      >`SELECT * FROM "public"."WaCampaignAttempt" WHERE id=${id}`;
      if (attempt[0]) {
        if (
          attempt[0].organizationId !== org(ctx) ||
          attempt[0].createdBy !== ctx.user.id
        )
          throw new WaError("معرّف المحاولة مستخدم لحملة أخرى.", 409);
        if (attempt[0].status === "CANCELLED")
          throw new WaError(
            "أُلغيت هذه المحاولة قبل تسجيل الحملة؛ أنشئ محاولة جديدة بعد المعاينة.",
            409,
          );
        if (
          attempt[0].organizationId !== org(ctx) ||
          attempt[0].createdBy !== ctx.user.id ||
          attempt[0].previewHash !== hash
        )
          throw new WaError("معرّف المحاولة مستخدم لحملة أخرى.", 409);
        return { id: attempt[0].campaignId };
      }
      const old = await tx.$queryRaw<
        Campaign[]
      >`SELECT * FROM "public"."WaCampaign" WHERE id=${id}`;
      if (old[0]) {
        if (
          old[0].organizationId !== org(ctx) ||
          old[0].createdBy !== ctx.user.id ||
          old[0].previewHash !== hash
        )
          throw new WaError("معرّف المحاولة مستخدم لحملة أخرى.", 409);
        return old[0];
      }
      // Price edits cannot race an accepted preview; freeze the policy on the campaign.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-connection:" + org(ctx)},0))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${WA_PRICING_LOCK}::text,0))`;
      const p = await prepare(tx, ctx, input);
      if (p.hash !== hash)
        throw new WaError(
          "تغيّرت بيانات المستلمين أو الأسعار؛ أعد المعاينة قبل الإرسال.",
          409,
        );
      if (!p.recipients.length)
        throw new WaError("لا يوجد مستلم مؤهل للإرسال.");
      // Two tabs can race before either sees the other's localStorage write.
      // Coalesce identical recipient/text snapshots within one minute, under this lock.
      const recent = await tx.$queryRaw<
        Campaign[]
      >`SELECT * FROM "public"."WaCampaign" WHERE "organizationId"=${org(ctx)} AND "createdBy"=${ctx.user.id} AND "previewHash"=${hash} AND "createdAt">NOW()-INTERVAL '1 minute' ORDER BY "createdAt" DESC LIMIT 1`;
      if (recent[0]) {
        await tx.$executeRaw`INSERT INTO "public"."WaCampaignAttempt" (id,"organizationId","createdBy","previewHash","campaignId") VALUES (${id},${org(ctx)},${ctx.user.id},${hash},${recent[0].id})`;
        return { id: recent[0].id };
      }
      const priceQuote = p.pricing
        ? { ...p.pricing, policy: p.pricingPolicy }
        : null;
      if (!p.pricing?.unitPriceIqd)
        throw new WaError("اضبط أسعار رسائل العراق قبل تأكيد الإرسال.", 409);
      await tx.$executeRaw`INSERT INTO "public"."WaCampaign" (id,"organizationId","branchId","createdBy","templateId",name,"previewHash","priceQuote","scheduledAt",status,"createdAt") VALUES (${id},${org(ctx)},${ctx.user.branchId ?? null},${ctx.user.id},${p.template.id},${name},${hash},${priceQuote ? JSON.stringify(priceQuote) : null}::jsonb,${p.scheduledAt},'QUEUED',NOW())`;
      const outbox = p.recipients.map((r) => ({ ...r, id: randomUUID() }));
      // One database round trip, rather than up to 1000 sequential inserts.
      await tx.$executeRaw`INSERT INTO "public"."WaMessage" (id,"campaignId","organizationId","patientId",phone,name,text,parameters,status,"updatedAt") SELECT x.id,${id},${org(ctx)},x."patientId",x.phone,x.name,x.text,x.parameters,'QUEUED',NOW() FROM jsonb_to_recordset(${JSON.stringify(outbox)}::jsonb) AS x(id text,"patientId" text,phone text,name text,text text,parameters jsonb)`;
      await tx.$executeRaw`INSERT INTO "public"."WaCampaignAttempt" (id,"organizationId","createdBy","previewHash","campaignId") VALUES (${id},${org(ctx)},${ctx.user.id},${hash},${id})`;
      await reserveCampaign(
        tx,
        org(ctx),
        id,
        outbox.map((m) => m.id),
        p.pricing.unitPriceIqd,
        p.pricing.policyRevision,
        ctx.user.id,
      );
      return { id };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 20000,
    },
  );
}

/** Atomic resolution prevents a late create request after the UI starts over. */
export async function resolveAttempt(
  db: PrismaClient,
  ctx: TenantContext,
  id: string,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-attempt:" + id}::text,0))`;
      const rows = await tx.$queryRaw<
        {
          organizationId: string;
          createdBy: string;
          campaignId: string | null;
          status: string;
        }[]
      >`SELECT * FROM "public"."WaCampaignAttempt" WHERE id=${id}`;
      const a = rows[0];
      if (a) {
        if (a.organizationId !== org(ctx) || a.createdBy !== ctx.user.id)
          throw new WaError("المحاولة غير موجودة ضمن حسابك.", 404);
        if (a.status === "CANCELLED") return { state: "CANCELLED" };
        if (!a.campaignId)
          throw new WaError("حالة المحاولة تحتاج مراجعة.", 409);
        await campaign(tx, ctx, a.campaignId);
        return { state: "RECORDED", id: a.campaignId };
      }
      const old = await tx.$queryRaw<
        Campaign[]
      >`SELECT * FROM "public"."WaCampaign" WHERE id=${id}`;
      if (old[0]) {
        if (
          old[0].organizationId !== org(ctx) ||
          old[0].createdBy !== ctx.user.id
        )
          throw new WaError("المحاولة غير موجودة ضمن حسابك.", 404);
        await campaign(tx, ctx, id);
        return { state: "RECORDED", id };
      }
      await tx.$executeRaw`INSERT INTO "public"."WaCampaignAttempt" (id,"organizationId","createdBy","previewHash","campaignId",status) VALUES (${id},${org(ctx)},${ctx.user.id},'',NULL,'CANCELLED')`;
      return { state: "CANCELLED" };
    },
    { timeout: 20000 },
  );
}

/** Lock the campaign before reading message states, so a concurrent resume
 * cannot leave QUEUED messages stranded under a stale COMPLETE status. */
export async function refreshCampaign(
  tx: Prisma.TransactionClient,
  id: string,
  organizationId: string,
) {
  const rows = await tx.$queryRaw<
    { status: string }[]
  >`SELECT status FROM "public"."WaCampaign" WHERE id=${id} AND "organizationId"=${organizationId} FOR UPDATE`;
  if (!rows[0] || rows[0].status === "CANCELLED") return;
  const states = await tx.$queryRaw<
    { status: string }[]
  >`SELECT DISTINCT status FROM "public"."WaMessage" WHERE "campaignId"=${id} AND "organizationId"=${organizationId}`;
  const values = states.map((m) => m.status);
  const status = values.some((s) => ["QUEUED", "SENDING"].includes(s))
    ? "QUEUED"
    : values.some((s) => ["UNKNOWN", "BLOCKED"].includes(s))
      ? "NEEDS_REVIEW"
      : "COMPLETE";
  await tx.$executeRaw`UPDATE "public"."WaCampaign" SET status=${status} WHERE id=${id} AND "organizationId"=${organizationId}`;
}
