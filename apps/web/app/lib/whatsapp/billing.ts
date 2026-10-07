import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { fingerprint, WaError } from "./domain";
import type { Db } from "./store";

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
export const walletCreditSchemaNote =
  "تسجيل رصيد بعد تحصيله من المؤسسة، وليس خصمًا من صندوق الصيدلية";
async function lockWallet(tx: Db, organizationId: string) {
  await tx.$executeRaw`INSERT INTO "public"."WaWallet" ("organizationId") VALUES (${organizationId}) ON CONFLICT DO NOTHING`;
  return (
    await tx.$queryRaw<{ availableIqd: bigint; reservedIqd: bigint }[]>`
    SELECT "availableIqd","reservedIqd" FROM "public"."WaWallet" WHERE "organizationId"=${organizationId} FOR UPDATE`
  )[0];
}
async function entry(
  tx: Db,
  org: string,
  key: string,
  kind: string,
  available: bigint,
  reserved: bigint,
  reference: string,
  createdBy: string,
  hash = "",
) {
  await tx.$executeRaw`UPDATE "public"."WaWallet" SET "availableIqd"="availableIqd"+${available},"reservedIqd"="reservedIqd"+${reserved},"updatedAt"=NOW() WHERE "organizationId"=${org}`;
  await tx.$executeRaw`INSERT INTO "public"."WaWalletEntry" (id,"organizationId","operationKey","requestHash",kind,"availableDelta","reservedDelta",reference,"createdBy") VALUES (${randomUUID()},${org},${key},${hash},${kind},${available},${reserved},${reference},${createdBy})`;
}
export async function walletSummary(db: Db, org: string) {
  const rows = await db.$queryRaw<
    { availableIqd: bigint; reservedIqd: bigint }[]
  >`
    SELECT "availableIqd","reservedIqd" FROM "public"."WaWallet" WHERE "organizationId"=${org}`;
  const entries = await db.$queryRaw<
    {
      id: string;
      kind: string;
      availableDelta: bigint;
      reservedDelta: bigint;
      reference: string;
      createdAt: Date;
    }[]
  >`
    SELECT id,kind,"availableDelta","reservedDelta",reference,"createdAt" FROM "public"."WaWalletEntry" WHERE "organizationId"=${org} ORDER BY "createdAt" DESC,id DESC LIMIT 100`;
  return {
    currency: "IQD",
    availableIqd: Number(rows[0]?.availableIqd ?? 0),
    reservedIqd: Number(rows[0]?.reservedIqd ?? 0),
    entries: entries.map((e) => ({
      ...e,
      availableDelta: Number(e.availableDelta),
      reservedDelta: Number(e.reservedDelta),
    })),
  };
}
/** Operation id + receipt prevent a lost answer from crediting the wallet twice. */
export async function creditWallet(
  db: PrismaClient,
  org: string,
  user: { id: string; name: string | null },
  input: { id: string; amountIqd: number; reference: string },
) {
  if (!Number.isSafeInteger(input.amountIqd) || input.amountIqd <= 0)
    throw new WaError("مبلغ الشحن غير صالح.");
  const hash = fingerprint({
    org,
    amountIqd: input.amountIqd,
    reference: input.reference,
  });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"wa-credit:" + input.id},0))`;
    const prior = await tx.$queryRaw<
      { organizationId: string; requestHash: string }[]
    >`SELECT "organizationId","requestHash" FROM "public"."WaWalletEntry" WHERE "operationKey"=${"credit:" + input.id}`;
    if (prior[0]) {
      if (prior[0].organizationId !== org || prior[0].requestHash !== hash)
        throw new WaError("معرّف الشحن مستخدم لمبلغ آخر.", 409);
      return;
    }
    const w = await lockWallet(tx, org),
      amount = BigInt(input.amountIqd);
    const receipt = await tx.$queryRaw<
      any[]
    >`SELECT id FROM "public"."WaWalletEntry" WHERE "organizationId"=${org} AND kind='CREDIT' AND reference=${input.reference}`;
    if (receipt.length)
      throw new WaError(
        "مستند التحصيل هذا مسجّل مسبقًا؛ راجع كشف الرصيد.",
        409,
      );
    if (w.availableIqd + w.reservedIqd + amount > MAX)
      throw new WaError("الرصيد يتجاوز الحد المدعوم.");
    await entry(
      tx,
      org,
      "credit:" + input.id,
      "CREDIT",
      amount,
      BigInt(0),
      input.reference,
      user.id,
      hash,
    );
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name ?? "",
        action: "WHATSAPP_WALLET_CREDIT",
        entity: "WhatsApp",
        entityId: org,
        details: JSON.stringify({
          organizationId: org,
          operationId: input.id,
          amountIqd: input.amountIqd,
          reference: input.reference,
        }),
      },
    });
  });
  return walletSummary(db, org);
}
/** Called inside campaign creation, after messages are inserted in the same transaction. */
export async function reserveCampaign(
  tx: Prisma.TransactionClient,
  org: string,
  campaignId: string,
  messages: string[],
  unitPrice: number,
  revision: number,
  userId: string,
) {
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice <= 0 ||
    !Number.isInteger(revision) ||
    revision < 1
  )
    throw new WaError("اضبط أسعار الرسائل قبل تأكيد الإرسال.", 409);
  const amount = BigInt(unitPrice) * BigInt(messages.length),
    w = await lockWallet(tx, org);
  if (amount > MAX || w.availableIqd < amount || w.reservedIqd + amount > MAX)
    throw new WaError(
      "رصيد الرسائل غير كافٍ؛ تواصل مع مدير المنصة لشحنه.",
      402,
    );
  await entry(
    tx,
    org,
    "reserve:" + campaignId,
    "RESERVE",
    -amount,
    amount,
    campaignId,
    userId,
  );
  const items = messages.map((messageId) => ({
    messageId,
    amountIqd: unitPrice,
    policyRevision: revision,
  }));
  await tx.$executeRaw`INSERT INTO "public"."WaMessageCharge" ("messageId","organizationId","amountIqd","policyRevision") SELECT x."messageId",${org},x."amountIqd",x."policyRevision" FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x("messageId" text,"amountIqd" bigint,"policyRevision" integer)`;
}
/** Caller locks the message first. Wallet precedes charge locks everywhere. */
export async function settleCharge(
  tx: Prisma.TransactionClient,
  org: string,
  messageId: string,
  outcome: "DELIVERED" | "FAILED" | "CANCELLED",
) {
  await lockWallet(tx, org);
  const row = (
    await tx.$queryRaw<{ state: string; amountIqd: bigint }[]>`
    SELECT state,"amountIqd" FROM "public"."WaMessageCharge" WHERE "messageId"=${messageId} AND "organizationId"=${org} FOR UPDATE`
  )[0];
  if (
    !row ||
    row.state === "CHARGED" ||
    (outcome !== "DELIVERED" && row.state === "RELEASED")
  )
    return;
  const charged = outcome === "DELIVERED";
  const available = charged
    ? row.state === "RELEASED"
      ? -row.amountIqd
      : BigInt(0)
    : row.amountIqd;
  const reserved = row.state === "RESERVED" ? -row.amountIqd : BigInt(0);
  await entry(
    tx,
    org,
    (charged ? "charge:" : "release:") + messageId,
    charged ? "CHARGE" : "RELEASE",
    available,
    reserved,
    messageId,
    "WHATSAPP",
  );
  await tx.$executeRaw`UPDATE "public"."WaMessageCharge" SET state=${charged ? "CHARGED" : "RELEASED"},"updatedAt"=NOW() WHERE "messageId"=${messageId} AND "organizationId"=${org}`;
}
export async function assertFundedMessage(
  db: Db,
  org: string,
  messageId: string,
) {
  const rows = await db.$queryRaw<
    { ok: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM "public"."WaMessageCharge" WHERE "messageId"=${messageId} AND "organizationId"=${org} AND state='RESERVED') AS ok`;
  if (!rows[0]?.ok)
    throw new WaError(
      "هذه الرسالة بلا حجز مالي صالح؛ راجع مدير المنصة ولا تعِد إنشاءها قبل حسمها.",
      409,
    );
}

/** Cancel up to 1000 never-submitted messages in a few database round trips. */
export async function releaseCancelledCharges(
  tx: Prisma.TransactionClient,
  org: string,
  ids: string[],
) {
  if (!ids.length) return;
  await lockWallet(tx, org);
  const released = await tx.$queryRaw<
    { messageId: string; amountIqd: bigint }[]
  >`UPDATE "public"."WaMessageCharge" SET state='RELEASED',"updatedAt"=NOW() WHERE "organizationId"=${org} AND "messageId" IN (${Prisma.join(ids)}) AND state='RESERVED' RETURNING "messageId","amountIqd"`;
  if (!released.length) return;
  const total = released.reduce((sum, m) => sum + m.amountIqd, BigInt(0));
  await tx.$executeRaw`UPDATE "public"."WaWallet" SET "availableIqd"="availableIqd"+${total},"reservedIqd"="reservedIqd"-${total},"updatedAt"=NOW() WHERE "organizationId"=${org}`;
  const entries = released.map((m) => ({
    id: randomUUID(),
    operationKey: "release:" + m.messageId,
    amount: String(m.amountIqd),
    reference: m.messageId,
  }));
  await tx.$executeRaw`INSERT INTO "public"."WaWalletEntry" (id,"organizationId","operationKey","requestHash",kind,"availableDelta","reservedDelta",reference,"createdBy") SELECT id,${org},"operationKey",'','RELEASE',amount,-amount,reference,'WHATSAPP' FROM jsonb_to_recordset(${JSON.stringify(entries)}::jsonb) AS x(id text,"operationKey" text,amount bigint,reference text)`;
}
