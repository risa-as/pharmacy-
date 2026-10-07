import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { seal, unseal, WaError } from "./domain";
import { connection, saveConnection, type Db } from "./store";
import { graph } from "./provider";
import { platformApp, exchangeSignupCode } from "./platform";
export async function assertNoPendingMessages(db: Db, org: string) {
  const r = await db.$queryRaw<
    { pending: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM "public"."WaMessage" WHERE "organizationId"=${org} AND status IN ('QUEUED','BLOCKED','SENDING','UNKNOWN','SENT')) AS pending`;
  if (r[0]?.pending)
    throw new WaError(
      "أوقف الرسائل المنتظرة واحسم الإرسال غير المؤكد قبل تغيير الربط.",
      409,
    );
}
export async function startSignup(
  db: PrismaClient,
  org: string,
  userId: string,
) {
  const config = platformApp();
  await assertNoPendingMessages(db, org);
  const row = (
    await db.$queryRaw<
      { updatedAt: Date }[]
    >`SELECT "updatedAt" FROM "public"."WaConnection" WHERE "organizationId"=${org}`
  )[0];
  const id = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaSignupAttempt" (id,"organizationId","createdBy",revision,"expiresAt") VALUES (${id},${org},${userId},${row?.updatedAt.toISOString() ?? null},NOW()+INTERVAL '20 minutes')`;
  return {
    id,
    appId: config.appId,
    configId: config.configId,
    version: config.version,
  };
}
async function claimAttempt(
  db: PrismaClient,
  org: string,
  userId: string,
  id: string,
  from: string,
  to: string,
) {
  const rows = await db.$queryRaw<
    any[]
  >`UPDATE "public"."WaSignupAttempt" SET state=${to} WHERE id=${id} AND "organizationId"=${org} AND "createdBy"=${userId} AND state=${from} AND "expiresAt">NOW() RETURNING *`;
  if (!rows[0])
    throw new WaError(
      "انتهت محاولة الربط أو بدأت معالجتها؛ تحقق من الحالة قبل بدء محاولة أخرى.",
      409,
    );
  return rows[0];
}
/** Called immediately when FB.login returns code, without waiting for the session event. */
export async function exchangeAttempt(
  db: PrismaClient,
  org: string,
  userId: string,
  id: string,
  code: string,
) {
  await claimAttempt(db, org, userId, id, "STARTED", "EXCHANGING");
  try {
    const token = await exchangeSignupCode(code);
    await db.$executeRaw`UPDATE "public"."WaSignupAttempt" SET "tokenEncrypted"=${seal(token)},state='TOKEN_READY' WHERE id=${id} AND "organizationId"=${org}`;
    return { ready: true };
  } catch (e) {
    await db.$executeRaw`UPDATE "public"."WaSignupAttempt" SET state='EXCHANGE_FAILED' WHERE id=${id} AND "organizationId"=${org}`;
    throw e;
  }
}
export async function finishSignup(
  db: PrismaClient,
  org: string,
  user: { id: string; name: string | null },
  id: string,
  phoneId: string,
  businessId: string,
) {
  const attempt = await claimAttempt(
      db,
      org,
      user.id,
      id,
      "TOKEN_READY",
      "FINISHING",
    ),
    app = platformApp();
  const conn = {
    organizationId: org,
    phoneId,
    businessId,
    token: unseal(attempt.tokenEncrypted),
    appSecret: app.secret,
    verifyToken: "",
  };
  try {
    await assertNoPendingMessages(db, org);
    const phones = await graph(
      conn,
      `${businessId}/phone_numbers?fields=id&limit=100`,
    );
    // Some completion events omit phone_number_id. Infer only an unambiguous WABA.
    if (!phoneId) {
      if (phones.data?.length !== 1 || !/^\d{5,30}$/.test(phones.data[0].id))
        throw new WaError(
          "لم تحدد Meta الرقم، والحساب يحتوي أكثر من رقم؛ راجع الربط قبل المتابعة.",
          409,
        );
      phoneId = phones.data[0].id;
      conn.phoneId = phoneId;
    }
    const info = await graph(
      conn,
      `${phoneId}?fields=id,is_on_biz_app,platform_type`,
    );
    if (
      info.id !== phoneId ||
      info.is_on_biz_app !== true ||
      info.platform_type !== "CLOUD_API" ||
      !phones.data?.some((p: { id: string }) => p.id === phoneId)
    )
      throw new WaError(
        "لم يكتمل ربط الرقم مع المشاركة أو أنه لا يتبع الحساب المحدد.",
        409,
      );
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-connection:" + org},0))`;
      await assertNoPendingMessages(tx, org);
      const current = (
        await tx.$queryRaw<
          { updatedAt: Date }[]
        >`SELECT "updatedAt" FROM "public"."WaConnection" WHERE "organizationId"=${org} FOR UPDATE`
      )[0];
      if ((current?.updatedAt.toISOString() ?? null) !== attempt.revision)
        throw new WaError("تغير الاتصال أثناء الربط؛ راجعه قبل المتابعة.", 409);
      const other = await tx.$queryRaw<
        any[]
      >`SELECT "organizationId" FROM "public"."WaConnection" WHERE "phoneId"=${phoneId} AND "organizationId"<>${org}`;
      if (other.length) throw new WaError("الرقم مرتبط بمؤسسة أخرى.", 409);
      await saveConnection(tx, org, conn);
      await tx.$executeRaw`UPDATE "public"."WaConnection" SET mode='COEXISTENCE',state='ONBOARDING',"allocationId"=NULL,"fundingId"=NULL,"billingVerifiedAt"=NULL,"onboardedAt"=NOW(),"disconnectedAt"=NULL,"contactsSyncState"='NOT_REQUESTED',"historySyncState"='NOT_REQUESTED',"contactsSyncRequestId"=NULL,"historySyncRequestId"=NULL WHERE "organizationId"=${org}`;
      await tx.$executeRaw`UPDATE "public"."WaSignupAttempt" SET state='CONNECTION_SAVED',"tokenEncrypted"=NULL WHERE id=${id}`;
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name ?? "",
          action: "WHATSAPP_COEXISTENCE_CONNECT",
          entity: "WhatsApp",
          entityId: org,
          details: JSON.stringify({
            organizationId: org,
            phoneId,
            businessId,
            billing: "PLATFORM_PENDING",
          }),
        },
      });
    });
    // No register/deregister: these would disrupt the existing Business app.
    const subscribed = await graph(conn, `${businessId}/subscribed_apps`, {});
    if (subscribed.success !== true)
      throw new WaError("لم تؤكد Meta اشتراك التطبيق بالإشعارات.", 502);
    await db.$executeRaw`UPDATE "public"."WaConnection" SET state='ACTIVE' WHERE "organizationId"=${org} AND "phoneId"=${phoneId} AND state='ONBOARDING'`;
    await requestInitialSync(db, org, "smb_app_state_sync");
    await requestInitialSync(db, org, "history");
    await db.$executeRaw`UPDATE "public"."WaSignupAttempt" SET state='DONE' WHERE id=${id}`;
    return { connected: true, billingPending: true };
  } catch (e) {
    await db.$executeRaw`UPDATE "public"."WaSignupAttempt" SET state='NEEDS_REVIEW',"tokenEncrypted"=NULL WHERE id=${id}`;
    throw e;
  }
}
/** One external request only; an uncertain answer is never retried automatically. */
export async function requestInitialSync(
  db: PrismaClient,
  org: string,
  type: "history" | "smb_app_state_sync",
) {
  const field = type === "history" ? "historySyncState" : "contactsSyncState";
  const claimed = await db.$queryRaw<any[]>(
    Prisma.sql`UPDATE "public"."WaConnection" SET ${Prisma.raw('"' + field + '"')}='REQUESTING' WHERE "organizationId"=${org} AND mode='COEXISTENCE' AND ${Prisma.raw('"' + field + '"')}='NOT_REQUESTED' AND "onboardedAt">NOW()-INTERVAL '24 hours' RETURNING "phoneId"`,
  );
  if (!claimed.length) return;
  let state = "UNKNOWN",
    requestId: string | null = null;
  try {
    const conn = await connection(db, org);
    if (!conn) throw new WaError("الاتصال غير موجود.");
    const r = await graph(conn, `${conn.phoneId}/smb_app_data`, {
      messaging_product: "whatsapp",
      sync_type: type,
    });
    requestId = r.request_id ? String(r.request_id) : null;
    state = requestId ? "REQUESTED" : "UNKNOWN";
  } catch {
    state = "UNKNOWN";
  }
  const requestField =
    type === "history" ? "historySyncRequestId" : "contactsSyncRequestId";
  await db.$executeRaw(
    Prisma.sql`UPDATE "public"."WaConnection" SET ${Prisma.raw('"' + field + '"')}=${state},${Prisma.raw('"' + requestField + '"')}=${requestId} WHERE "organizationId"=${org} AND ${Prisma.raw('"' + field + '"')}='REQUESTING'`,
  );
}

/** Repeating app subscription is safe; one-shot sync requests keep their persisted state. */
export async function completeSavedCoexistence(
  db: PrismaClient,
  org: string,
  user: { id: string; name: string | null },
) {
  const c = await connection(db, org);
  if (
    !c ||
    c.mode !== "COEXISTENCE" ||
    !["ONBOARDING", "NEEDS_REVIEW"].includes(c.state ?? "")
  )
    throw new WaError("لا يوجد ربط مشاركة محفوظ ينتظر التحقق.", 409);
  const info = await graph(
    c,
    `${c.phoneId}?fields=id,is_on_biz_app,platform_type`,
  );
  if (
    info.id !== c.phoneId ||
    info.is_on_biz_app !== true ||
    info.platform_type !== "CLOUD_API"
  )
    throw new WaError(
      "الرقم غير متصل بالمشاركة حاليًا؛ أعد الربط لدى Meta.",
      409,
    );
  const r = await graph(c, `${c.businessId}/subscribed_apps`, {});
  if (r.success !== true)
    throw new WaError("لم تؤكد Meta اشتراك التطبيق بالإشعارات.", 502);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-connection:" + org},0))`;
    const current = await connection(tx, org);
    if (
      !current ||
      current.token !== c.token ||
      current.phoneId !== c.phoneId ||
      current.state !== c.state
    )
      throw new WaError("تغير الاتصال أثناء التحقق؛ راجع حالته.", 409);
    await tx.$executeRaw`UPDATE "public"."WaConnection" SET state='ACTIVE',"billingVerifiedAt"=NULL WHERE "organizationId"=${org}`;
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name ?? "",
        action: "WHATSAPP_COEXISTENCE_RECHECK",
        entity: "WhatsApp",
        entityId: org,
        details: JSON.stringify({ organizationId: org, phoneId: c.phoneId }),
      },
    });
  });
  await requestInitialSync(db, org, "smb_app_state_sync");
  await requestInitialSync(db, org, "history");
  return { connected: true, billingPending: true };
}
