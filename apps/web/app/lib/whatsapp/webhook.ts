import { Prisma, PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import {
  advancesStatus,
  fingerprint,
  normalizePhone,
  sameSecret,
  seal,
  unseal,
} from "./domain";
import { settleCharge } from "./billing";
import { refreshCampaign } from "./store";
export function webhookSignature(
  raw: string,
  secret: string,
  signature: string,
) {
  return sameSecret(
    signature,
    "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"),
  );
}
export function isOptOut(m: any) {
  const words = [
    m.text?.body,
    m.button?.payload,
    m.button?.text,
    m.interactive?.button_reply?.id,
    m.interactive?.button_reply?.title,
    m.interactive?.list_reply?.id,
    m.interactive?.list_reply?.title,
  ];
  return words.some(
    (w) =>
      typeof w === "string" &&
      [
        "stop",
        "unsubscribe",
        "إيقاف",
        "ايقاف",
        "إلغاء",
        "الغاء",
        "إلغاء الاشتراك",
        "الغاء الاشتراك",
      ].includes(w.trim().toLowerCase()),
  );
}
/** Bound each history batch before storing; the webhook ACK never waits on thousands of writes. */
export function splitChange(change: any) {
  const v = change.value ?? {},
    messages =
      change.field === "history"
        ? (v.history ?? []).flatMap((h: any) =>
            (h.threads ?? []).flatMap((t: any) =>
              (t.messages ?? []).map((m: any) => ({ ...m, threadPhone: t.id })),
            ),
          )
        : change.field === "smb_message_echoes"
          ? (v.message_echoes ?? [])
          : change.field === "smb_app_state_sync"
            ? (v.state_sync ?? [])
            : (v.messages ?? []);
  const batches: any[] = [],
    statuses = v.statuses ?? [];
  for (let i = 0; i < Math.max(1, messages.length, statuses.length); i += 100)
    batches.push({
      field: change.field,
      value: {
        ...v,
        statuses: statuses.slice(i, i + 100),
        history: undefined,
        state_sync: undefined,
        message_echoes: undefined,
        messages: messages.slice(i, i + 100),
        historyComplete:
          i + 100 >= messages.length &&
          (v.history ?? []).some((h: any) => h.metadata?.progress === 100),
        historyDeclined: (v.history ?? []).some((h: any) =>
          h.errors?.some((e: any) => e.code === 2593109),
        ),
      },
    });
  return batches;
}
export async function enqueueWebhook(
  db: PrismaClient,
  payload: any,
  onlyOrg?: string,
) {
  const items: Array<{
    id: string;
    organizationId: string;
    phoneId: string;
    payloadEncrypted: string;
  }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneId = change.value?.metadata?.phone_number_id;
      const connections = await db.$queryRaw<
        { organizationId: string; phoneId: string }[]
      >`SELECT "organizationId","phoneId" FROM "public"."WaConnection" WHERE "businessId"=${String(entry.id ?? "")} AND (${!onlyOrg} OR "organizationId"=${onlyOrg ?? ""}) AND (${!phoneId} OR "phoneId"=${String(phoneId ?? "")})`;
      if (change.field === "account_update") {
        // WABA lifecycle may omit phone id: stop all affected numbers immediately.
        const event = String(change.value?.event ?? "");
        if (
          [
            "PARTNER_REMOVED",
            "ACCOUNT_OFFBOARDED",
            "ACCOUNT_RECONNECTED",
          ].includes(event)
        )
          for (const c of connections) {
            const nextState =
              event === "ACCOUNT_RECONNECTED" ? "NEEDS_REVIEW" : "DISCONNECTED";
            await db.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-connection:" + c.organizationId},0))`;
              const changed =
                await tx.$executeRaw`UPDATE "public"."WaConnection" SET state=${nextState},"disconnectedAt"=NOW(),"billingVerifiedAt"=NULL,"updatedAt"=NOW() WHERE "organizationId"=${c.organizationId} AND "businessId"=${String(entry.id)} AND "phoneId"=${c.phoneId} AND (state<>${nextState} OR "billingVerifiedAt" IS NOT NULL)`;
              if (changed)
                await tx.auditLog.create({
                  data: {
                    userId: "WHATSAPP",
                    userName: "WhatsApp",
                    action: "WHATSAPP_ACCOUNT_UPDATE",
                    entity: "WhatsApp",
                    entityId: c.organizationId,
                    details: JSON.stringify({
                      organizationId: c.organizationId,
                      event,
                      state: nextState,
                    }),
                  },
                });
            });
          }
        continue;
      }
      if (!phoneId) continue;
      for (const c of connections)
        for (const batch of splitChange(change)) {
          const data = { ...batch, businessId: String(entry.id) };
          items.push({
            id: fingerprint({
              org: c.organizationId,
              phoneId: c.phoneId,
              data,
            }),
            organizationId: c.organizationId,
            phoneId: c.phoneId,
            payloadEncrypted: seal(JSON.stringify(data)),
          });
        }
    }
  }
  if (items.length)
    await db.$executeRaw`INSERT INTO "public"."WaWebhookEvent" (id,"organizationId","phoneId","payloadEncrypted") SELECT id,"organizationId","phoneId","payloadEncrypted" FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(id text,"organizationId" text,"phoneId" text,"payloadEncrypted" text) ON CONFLICT DO NOTHING`;
}
async function inbox(
  db: PrismaClient,
  org: string,
  m: any,
  source: string,
  businessPhone?: string,
) {
  const direction =
    source === "BUSINESS_APP" || source === "API"
      ? "OUT"
      : source === "HISTORY"
        ? String(m.from).replace(/\D/g, "") ===
          String(businessPhone ?? "").replace(/\D/g, "")
          ? "OUT"
          : "IN"
        : "IN";
  const phone = normalizePhone(
    String(m.threadPhone ?? (direction === "OUT" ? m.to : m.from) ?? ""),
  );
  const sentAt = new Date(Number(m.timestamp) * 1000);
  if (!phone || typeof m.id !== "string" || !Number.isFinite(sentAt.getTime()))
    return;
  const type = String(m.type ?? "text"),
    content = JSON.stringify({
      type,
      body: String(
        m.text?.body ??
          m.button?.text ??
          m[type]?.caption ??
          (type === "text" ? "" : "رسالة " + type),
      ).slice(0, 4096),
    });
  await db.$executeRaw`INSERT INTO "public"."WaInboxMessage" ("organizationId","providerId",phone,direction,source,"contentEncrypted","sentAt") VALUES (${org},${m.id},${phone},${direction},${source},${seal(content)},${sentAt}) ON CONFLICT ("organizationId","providerId") DO UPDATE SET "contentEncrypted"=CASE WHEN ${type}<>'media_placeholder' THEN EXCLUDED."contentEncrypted" ELSE "public"."WaInboxMessage"."contentEncrypted" END`;
}
export async function processWebhookChange(
  db: PrismaClient,
  org: string,
  change: any,
) {
  const v = change.value ?? {};
  for (const s of v.statuses ?? []) {
    const status = String(s.status).toUpperCase(),
      phone = normalizePhone(String(s.recipient_id ?? ""));
    if (!phone || !["SENT", "DELIVERED", "READ", "FAILED"].includes(status))
      continue;
    const callback = String(s.biz_opaque_callback_data ?? "");
    const candidates = await db.$queryRaw<
      { id: string; campaignId: string }[]
    >`SELECT id,"campaignId" FROM "public"."WaMessage" WHERE "organizationId"=${org} AND phone=${phone} AND ("providerId"=${String(s.id)} OR id=${callback})`;
    for (const candidate of candidates)
      await db.$transaction(async (tx) => {
        // Same lock order as resume/cancel: campaign, message, wallet.
        await tx.$queryRaw`SELECT id FROM "public"."WaCampaign" WHERE id=${candidate.campaignId} AND "organizationId"=${org} FOR UPDATE`;
        const m = (
          await tx.$queryRaw<
            any[]
          >`SELECT * FROM "public"."WaMessage" WHERE id=${candidate.id} AND "organizationId"=${org} FOR UPDATE`
        )[0];
        if (
          !m ||
          (m.providerId && m.providerId !== String(s.id)) ||
          !advancesStatus(m.status, status)
        )
          return;
        await tx.$executeRaw`UPDATE "public"."WaMessage" SET status=${status},"providerId"=${String(s.id)},"providerErrorCode"=${status === "FAILED" ? String(s.errors?.[0]?.code ?? "UNKNOWN") : null},error=${status === "FAILED" ? "رفض أو تعذر تسليم الرسالة لدى WhatsApp" : null},"updatedAt"=NOW() WHERE id=${m.id} AND "organizationId"=${org}`;
        if (status === "DELIVERED" || status === "READ")
          await settleCharge(tx, org, m.id, "DELIVERED");
        if (status === "FAILED") await settleCharge(tx, org, m.id, "FAILED");
        await refreshCampaign(tx, m.campaignId, org);
      });
  }
  if (change.field === "history") {
    if (v.historyDeclined)
      await db.$executeRaw`UPDATE "public"."WaConnection" SET "historySyncState"='DECLINED' WHERE "organizationId"=${org}`;
    else if (v.historyComplete)
      await db.$executeRaw`UPDATE "public"."WaConnection" SET "historySyncState"='TRANSFER_COMPLETE' WHERE "organizationId"=${org} AND "historySyncState"<>'DECLINED'`;
  }
  if (change.field === "smb_app_state_sync") {
    // Contacts do not create patient records or marketing consent.
    await db.$executeRaw`UPDATE "public"."WaConnection" SET "contactsSyncState"='RECEIVING' WHERE "organizationId"=${org}`;
    return;
  }
  for (const m of v.messages ?? []) {
    const source =
      change.field === "history"
        ? "HISTORY"
        : change.field === "smb_message_echoes"
          ? "BUSINESS_APP"
          : "INBOUND";
    await inbox(db, org, m, source, v.metadata?.display_phone_number);
    // Historical STOP and outgoing echoes cannot change current consent.
    if (source !== "INBOUND" || !isOptOut(m)) continue;
    const phone = normalizePhone(String(m.from ?? ""));
    if (!phone) continue;
    await db.$executeRaw`INSERT INTO "public"."WaConsent" ("organizationId",phone,allowed,evidence,"recordedBy","updatedAt") VALUES (${org},${phone},false,'إلغاء الاشتراك برسالة WhatsApp','WHATSAPP',NOW()) ON CONFLICT ("organizationId",phone) DO UPDATE SET allowed=false,evidence=EXCLUDED.evidence,"recordedBy"='WHATSAPP',"updatedAt"=NOW()`;
  }
}
export async function drainWebhooks(db: PrismaClient, limit = 4) {
  await db.$executeRaw`UPDATE "public"."WaWebhookEvent" SET state='QUEUED' WHERE state='PROCESSING' AND "claimedAt"<NOW()-INTERVAL '10 minutes'`;
  let processed = 0;
  for (let i = 0; i < Math.min(limit, 4); i++) {
    const e = (
      await db.$queryRaw<
        any[]
      >`WITH next AS (SELECT id FROM "public"."WaWebhookEvent" WHERE state='QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE "public"."WaWebhookEvent" e SET state='PROCESSING',"claimedAt"=NOW() FROM next WHERE e.id=next.id RETURNING e.*`
    )[0];
    if (!e) break;
    try {
      const c = (
          await db.$queryRaw<
            any[]
          >`SELECT "phoneId","businessId" FROM "public"."WaConnection" WHERE "organizationId"=${e.organizationId}`
        )[0],
        change = JSON.parse(unseal(e.payloadEncrypted));
      if (c?.phoneId === e.phoneId && c.businessId === change.businessId)
        await processWebhookChange(db, e.organizationId, change);
      await db.$executeRaw`UPDATE "public"."WaWebhookEvent" SET state='DONE',"payloadEncrypted"='' WHERE id=${e.id}`;
      processed++;
    } catch {
      await db.$executeRaw`UPDATE "public"."WaWebhookEvent" SET state='NEEDS_REVIEW' WHERE id=${e.id}`;
    }
  }
  return processed;
}
