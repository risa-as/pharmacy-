import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock("@/app/lib/prisma", () => ({
  get prisma() {
    return state.db;
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import {
  creditWallet,
  reserveCampaign,
  settleCharge,
  walletSummary,
  assertFundedMessage,
} from "../app/lib/whatsapp/billing";
import {
  saveConnection,
  createCampaign,
  prepare,
} from "../app/lib/whatsapp/store";
import {
  processWebhookChange,
  enqueueWebhook,
  drainWebhooks,
} from "../app/lib/whatsapp/webhook";
import {
  startSignup,
  exchangeAttempt,
  finishSignup,
  requestInitialSync,
  completeSavedCoexistence,
} from "../app/lib/whatsapp/coexistence";
import {
  POST as billing,
  GET as billingGet,
} from "../app/api/admin/organizations/[id]/whatsapp/billing/route";
import { POST as sharedWebhook } from "../app/api/whatsapp/webhook/route";
import { GET as inbox } from "../app/api/whatsapp/inbox/route";
import { runQueue } from "../app/lib/whatsapp/worker";
import { POST as campaignAction } from "../app/api/whatsapp/route";
import { POST as signupAction } from "../app/api/admin/organizations/[id]/whatsapp/signup/route";
import { WHATSAPP_IRAQ_REFERENCE } from "../app/lib/whatsapp/pricing";
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
state.db = db;
let org: string,
  otherOrg: string,
  user: any,
  admin: any,
  branch: string,
  patient: string,
  template: string,
  previous: any[];
const context = () => ({ params: Promise.resolve({ id: org }) });
const send = (body: any) =>
  billing(
    new NextRequest("http://localhost/api/admin/billing", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    context(),
  );
const credit = (
  amountIqd = 1000,
  id = randomUUID(),
  reference = "receipt-" + randomUUID(),
) => creditWallet(db, org, admin, { id, amountIqd, reference });
async function reserve(messageId: string, amount = 60) {
  await db.$transaction((tx) =>
    reserveCampaign(
      tx,
      org,
      "campaign-" + messageId,
      [messageId],
      amount,
      1,
      user.id,
    ),
  );
}
async function settle(
  messageId: string,
  outcome: "DELIVERED" | "FAILED" | "CANCELLED",
) {
  await db.$transaction((tx) => settleCharge(tx, org, messageId, outcome));
}
beforeAll(async () => {
  process.env.WHATSAPP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  org = (
    await db.organization.create({
      data: { name: "Isolated WA billing " + randomUUID() },
    })
  ).id;
  otherOrg = (
    await db.organization.create({
      data: { name: "Isolated WA foreign " + randomUUID() },
    })
  ).id;
  branch = (
    await db.branch.create({ data: { name: "Synthetic", organizationId: org } })
  ).id;
  user = await db.user.create({
    data: {
      email: randomUUID() + "@test.invalid",
      password: "unused",
      role: "ADMIN",
      branchId: branch,
    },
  });
  admin = await db.user.create({
    data: {
      email: randomUUID() + "@test.invalid",
      password: "unused",
      role: "SUPER_ADMIN",
      name: "Synthetic platform admin",
    },
  });
  patient = (
    await db.patient.create({
      data: {
        name: "Synthetic patient",
        phone: "07701234567",
        branchId: branch,
      },
    })
  ).id;
  template = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaTemplateVersion" (id,"organizationId",name,body,language,category,status,"metaName") VALUES (${template},${org},'Synthetic','مرحباً {{اسم_العميل}}','ar','MARKETING','APPROVED','synthetic_template')`;
  await db.$executeRaw`INSERT INTO "public"."WaConsent" ("organizationId",phone,allowed,evidence,"recordedBy","updatedAt") VALUES (${org},'9647701234567',true,'synthetic',${user.id},NOW())`;
  previous = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaPricingPolicy"`;
});
beforeEach(async () => {
  state.session = { user: admin };
  for (const table of [
    "WaWalletEntry",
    "WaMessageCharge",
    "WaWallet",
    "WaSignupAttempt",
    "WaWebhookEvent",
    "WaInboxMessage",
    "WaConnection",
  ])
    await db.$executeRawUnsafe(
      `DELETE FROM "public"."${table}" WHERE "organizationId" IN ($1,$2)`,
      org,
      otherOrg,
    );
  await db.$executeRaw`DELETE FROM "public"."WaCampaignAttempt" WHERE "organizationId"=${org}`;
  await db.$executeRaw`DELETE FROM "public"."WaMessage" WHERE "organizationId"=${org}`;
  await db.$executeRaw`DELETE FROM "public"."WaCampaign" WHERE "organizationId"=${org}`;
  await db.auditLog.deleteMany({ where: { userId: admin.id } });
  vi.stubEnv("META_GRAPH_VERSION", "v99.0");
  vi.stubEnv("WHATSAPP_META_APP_ID", "111111");
  vi.stubEnv("WHATSAPP_SIGNUP_CONFIG_ID", "222222");
  vi.stubEnv("WHATSAPP_META_APP_SECRET", "synthetic-platform-app-secret");
  vi.stubEnv("WHATSAPP_META_CREDIT_LINE_ID", "333333");
  vi.stubEnv("WHATSAPP_META_SYSTEM_TOKEN", "synthetic-system-token-only");
  vi.stubEnv("WHATSAPP_SEND_ENABLED", "false");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("oauth/access_token")
              ? { access_token: "synthetic-customer-token-only" }
              : url.includes("is_on_biz_app")
                ? {
                    id: "123456",
                    is_on_biz_app: true,
                    platform_type: "CLOUD_API",
                  }
                : url.includes("phone_numbers")
                  ? { data: [{ id: "123456" }] }
                  : url.includes("owning_credit")
                    ? { data: [{ id: "444444" }] }
                    : url.includes("receiving_credential")
                      ? { id: "444444", receiving_credential: { id: "555555" } }
                      : url.includes("primary_funding_id")
                        ? { id: "456789", primary_funding_id: "555555" }
                        : url.includes("smb_app_data")
                          ? { request_id: "fake-sync-id" }
                          : { success: true },
          ),
        ),
    ),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const table of [
    "WaWalletEntry",
    "WaMessageCharge",
    "WaWallet",
    "WaSignupAttempt",
    "WaWebhookEvent",
    "WaInboxMessage",
    "WaConnection",
    "WaCampaignAttempt",
    "WaMessage",
    "WaCampaign",
    "WaTemplateVersion",
    "WaConsent",
  ])
    await db.$executeRawUnsafe(
      `DELETE FROM "public"."${table}" WHERE "organizationId" IN ($1,$2)`,
      org,
      otherOrg,
    );
  await db.$executeRaw`DELETE FROM "public"."WaPricingPolicy"`;
  for (const p of previous ?? [])
    await db.$executeRaw`INSERT INTO "public"."WaPricingPolicy" (id,revision,config,"updatedBy","updatedAt") VALUES (${p.id},${p.revision},${JSON.stringify(p.config)}::jsonb,${p.updatedBy},${p.updatedAt})`;
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: [user.id, admin.id] } },
        { entityId: { in: [org, otherOrg] } },
      ],
    },
  });
  await db.patient.delete({ where: { id: patient } });
  await db.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } });
  await db.branch.delete({ where: { id: branch } });
  await db.organization.deleteMany({ where: { id: { in: [org, otherOrg] } } });
  await db.$disconnect();
});
it("credits once after a lost answer and rejects changes to the same operation", async () => {
  const id = randomUUID(),
    reference = "synthetic receipt";
  await credit(1000, id, reference);
  await credit(1000, id, reference);
  expect((await walletSummary(db, org)).availableIqd).toBe(1000);
  expect(await db.auditLog.count({ where: { userId: admin.id } })).toBe(1);
  await expect(credit(2000, id, reference)).rejects.toThrow("معرّف");
});
it("rejects reuse of a receipt with a different operation id", async () => {
  await credit(1000, randomUUID(), "receipt-unique");
  await expect(credit(1000, randomUUID(), "receipt-unique")).rejects.toThrow(
    "مستند",
  );
  expect((await walletSummary(db, org)).availableIqd).toBe(1000);
});
it("serializes concurrent credits with the same id", async () => {
  const id = randomUUID();
  await Promise.all([
    credit(1000, id, "concurrent"),
    credit(1000, id, "concurrent"),
  ]);
  expect((await walletSummary(db, org)).availableIqd).toBe(1000);
});
it("rolls back credit when the audit write fails", async () => {
  const original = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((fn: any) =>
    original(async (tx) => {
      const audit = vi
        .spyOn(tx.auditLog, "create")
        .mockRejectedValueOnce(new Error("audit unavailable"));
      try {
        return await fn(tx);
      } finally {
        audit.mockRestore();
      }
    })) as any);
  try {
    await expect(credit()).rejects.toThrow("audit unavailable");
  } finally {
    spy.mockRestore();
  }
  expect((await walletSummary(db, org)).availableIqd).toBe(0);
  expect((await walletSummary(db, org)).entries).toHaveLength(0);
});
it.each([0, -1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid credit %s",
  async (n) => {
    await expect(credit(n)).rejects.toThrow();
    expect((await walletSummary(db, org)).entries).toHaveLength(0);
  },
);
it("blocks wallet mutation for pharmacy users and inactive platform admins", async () => {
  state.session = { user };
  expect(
    (
      await send({
        action: "credit",
        id: randomUUID(),
        amountIqd: 1000,
        reference: "receipt",
      })
    ).status,
  ).toBe(403);
  await db.user.update({ where: { id: admin.id }, data: { isActive: false } });
  state.session = { user: admin };
  expect(
    (await billingGet(new NextRequest("http://localhost"), context())).status,
  ).toBe(403);
  await db.user.update({ where: { id: admin.id }, data: { isActive: true } });
  expect((await walletSummary(db, org)).availableIqd).toBe(0);
});
it("holds funds and charges a delivered/read message exactly once", async () => {
  await credit();
  const id = randomUUID();
  await reserve(id);
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 940,
    reservedIqd: 60,
  });
  await settle(id, "DELIVERED");
  await settle(id, "DELIVERED");
  await settle(id, "FAILED");
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 940,
    reservedIqd: 0,
  });
  expect(
    (await walletSummary(db, org)).entries.filter((e) => e.kind === "CHARGE"),
  ).toHaveLength(1);
});
it("returns a failed or cancelled hold exactly once", async () => {
  await credit();
  const id = randomUUID();
  await reserve(id);
  await settle(id, "FAILED");
  await settle(id, "CANCELLED");
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 1000,
    reservedIqd: 0,
  });
});
it("honors late confirmed delivery after a release without losing or duplicating the debit", async () => {
  await credit(60);
  const first = randomUUID(),
    second = randomUUID();
  await reserve(first);
  await settle(first, "FAILED");
  await reserve(second);
  await settle(first, "DELIVERED");
  await settle(first, "DELIVERED");
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: -60,
    reservedIqd: 60,
  });
  await expect(reserve(randomUUID())).rejects.toThrow("غير كاف");
});
it("serializes competing reservations and prevents overspending", async () => {
  await credit(60);
  const result = await Promise.allSettled([
    reserve(randomUUID()),
    reserve(randomUUID()),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 0,
    reservedIqd: 60,
  });
});
it("never accepts another institution's hold", async () => {
  await credit();
  const id = randomUUID();
  await reserve(id);
  await expect(assertFundedMessage(db, otherOrg, id)).rejects.toThrow(
    "بلا حجز",
  );
  await db.$transaction((tx) => settleCharge(tx, otherOrg, id, "DELIVERED"));
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 940,
    reservedIqd: 60,
  });
});
it("rolls back the entire campaign when funds are insufficient and preserves a frozen quote on retry", async () => {
  await db.$executeRaw`DELETE FROM "public"."WaPricingPolicy"`;
  await db.$executeRaw`INSERT INTO "public"."WaPricingPolicy" (id,revision,config,"updatedBy") VALUES ('singleton',1,${JSON.stringify(WHATSAPP_IRAQ_REFERENCE)}::jsonb,${admin.id})`;
  const ctx: any = {
      user,
      organizationId: org,
      tenantBranchWhere: { branchId: branch },
    },
    input = {
      templateId: template,
      selection: { mode: "ids", ids: [patient], excludedIds: [] },
      values: { custom1: "", custom2: "" },
    },
    p = await prepare(db, ctx, input),
    id = randomUUID();
  await expect(
    createCampaign(db, ctx, input, id, p.hash, "Synthetic billing"),
  ).rejects.toThrow("غير كاف");
  expect(
    await db.$queryRaw`SELECT id FROM "public"."WaCampaign" WHERE id=${id}`,
  ).toEqual([]);
  await credit();
  await createCampaign(db, ctx, input, id, p.hash, "Synthetic billing");
  await createCampaign(db, ctx, input, id, p.hash, "Synthetic billing");
  expect((await walletSummary(db, org)).reservedIqd).toBe(
    p.pricing!.unitPriceIqd,
  );
  expect(
    (await walletSummary(db, org)).entries.filter((e) => e.kind === "RESERVE"),
  ).toHaveLength(1);
});
async function connect() {
  await saveConnection(db, org, {
    phoneId: "123456",
    businessId: "456789",
    token: "synthetic-customer-token-only",
    appSecret: "synthetic-platform-app-secret",
  });
}
it("proves central billing using Meta reads and logs no secrets", async () => {
  await connect();
  expect(
    (await send({ action: "verify", allocationId: "444444" })).status,
  ).toBe(200);
  const row = (
    await db.$queryRaw<
      any[]
    >`SELECT * FROM "public"."WaConnection" WHERE "organizationId"=${org}`
  )[0];
  expect(row.fundingId).toBe("555555");
  expect(row.billingVerifiedAt).toBeInstanceOf(Date);
  const body = await (
    await billingGet(new NextRequest("http://localhost"), context())
  ).text();
  expect(body).not.toContain("synthetic-customer-token");
  expect(body).not.toContain("tokenEncrypted");
});
it("does not activate disconnected connections by funding verification", async () => {
  await connect();
  await db.$executeRaw`UPDATE "public"."WaConnection" SET state='DISCONNECTED' WHERE "organizationId"=${org}`;
  expect(
    (await send({ action: "verify", allocationId: "444444" })).status,
  ).toBe(409);
});
it("exchanges the signup code once, binds it to administrator/institution, and never registers the existing app number", async () => {
  const start = await startSignup(db, org, admin.id);
  await expect(
    exchangeAttempt(db, otherOrg, admin.id, start.id, "fake-code"),
  ).rejects.toThrow();
  await exchangeAttempt(db, org, admin.id, start.id, "fake-code");
  await expect(
    exchangeAttempt(db, org, admin.id, start.id, "fake-code"),
  ).rejects.toThrow();
  await finishSignup(db, org, admin, start.id, "123456", "456789");
  const c = (
    await db.$queryRaw<
      any[]
    >`SELECT * FROM "public"."WaConnection" WHERE "organizationId"=${org}`
  )[0];
  expect(c).toMatchObject({
    mode: "COEXISTENCE",
    state: "ACTIVE",
    contactsSyncState: "REQUESTED",
    historySyncState: "REQUESTED",
    billingVerifiedAt: null,
  });
  expect(c.tokenEncrypted).not.toContain("synthetic-customer-token");
  const calls = (fetch as any).mock.calls;
  expect(calls.some(([url]: any) => /\/register|\/deregister/.test(url))).toBe(
    false,
  );
  expect(
    calls.filter(([url]: any) => url.includes("subscribed_apps")),
  ).toHaveLength(1);
  await requestInitialSync(db, org, "history");
  expect(
    (fetch as any).mock.calls.filter(([url]: any) =>
      url.includes("smb_app_data"),
    ),
  ).toHaveLength(2);
});
it("retains UNKNOWN for a lost sync answer and never blindly repeats it", async () => {
  await connect();
  await db.$executeRaw`UPDATE "public"."WaConnection" SET mode='COEXISTENCE',"onboardedAt"=NOW() WHERE "organizationId"=${org}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("lost answer");
    }),
  );
  await requestInitialSync(db, org, "history");
  await requestInitialSync(db, org, "history");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT "historySyncState" FROM "public"."WaConnection" WHERE "organizationId"=${org}`
    )[0].historySyncState,
  ).toBe("UNKNOWN");
});
it("routes signed shared callbacks by both WABA and phone and stops a WABA with no phone metadata", async () => {
  await connect();
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "wrong-account",
        changes: [
          {
            field: "messages",
            value: { metadata: { phone_number_id: "123456" }, messages: [] },
          },
        ],
      },
    ],
  };
  await enqueueWebhook(db, payload);
  expect(
    await db.$queryRaw`SELECT id FROM "public"."WaWebhookEvent" WHERE "organizationId"=${org}`,
  ).toEqual([]);
  await enqueueWebhook(db, {
    entry: [
      {
        id: "456789",
        changes: [
          { field: "account_update", value: { event: "PARTNER_REMOVED" } },
        ],
      },
    ],
  });
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT state FROM "public"."WaConnection" WHERE "organizationId"=${org}`
    )[0].state,
  ).toBe("DISCONNECTED");
});
it("rejects invalid signatures without accepting events", async () => {
  expect(
    (
      await sharedWebhook(
        new NextRequest("http://localhost/webhook", {
          method: "POST",
          headers: { "x-hub-signature-256": "invalid" },
          body: '{"object":"whatsapp_business_account","entry":[]}',
        }),
      )
    ).status,
  ).toBe(403);
});
it("persists and deduplicates echoes asynchronously, with no wallet charge or recipient opt-out", async () => {
  await connect();
  await credit();
  const change = {
      field: "smb_message_echoes",
      value: {
        metadata: { phone_number_id: "123456" },
        message_echoes: [
          {
            id: "wamid.echo",
            to: "9647701234567",
            from: "9647709999999",
            type: "text",
            text: { body: "STOP" },
            timestamp: "1791363600",
          },
        ],
      },
    },
    payload = {
      object: "whatsapp_business_account",
      entry: [{ id: "456789", changes: [change] }],
    },
    raw = JSON.stringify(payload),
    signature =
      "sha256=" +
      createHmac("sha256", "synthetic-platform-app-secret")
        .update(raw)
        .digest("hex");
  const req = () =>
    new NextRequest("http://localhost/webhook", {
      method: "POST",
      body: raw,
      headers: { "x-hub-signature-256": signature },
    });
  expect((await sharedWebhook(req())).status).toBe(200);
  expect((await sharedWebhook(req())).status).toBe(200);
  expect(
    await db.$queryRaw`SELECT "providerId" FROM "public"."WaInboxMessage" WHERE "organizationId"=${org}`,
  ).toEqual([]);
  expect((await runQueue(db)).webhooksProcessed).toBe(1);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaInboxMessage" WHERE "organizationId"=${org}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].contentEncrypted).not.toContain("STOP");
  expect((await walletSummary(db, org)).availableIqd).toBe(1000);
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT allowed FROM "public"."WaConsent" WHERE "organizationId"=${org}`
    )[0].allowed,
  ).toBe(true);
});
it("applies incoming button opt-out but ignores historical STOP", async () => {
  await processWebhookChange(db, org, {
    field: "history",
    value: { messages: [{ from: "9647701234567", text: { body: "STOP" } }] },
  });
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT allowed FROM "public"."WaConsent" WHERE "organizationId"=${org}`
    )[0].allowed,
  ).toBe(true);
  await processWebhookChange(db, org, {
    field: "messages",
    value: {
      messages: [
        {
          from: "9647701234567",
          interactive: { button_reply: { id: "stop" } },
        },
      ],
    },
  });
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT allowed FROM "public"."WaConsent" WHERE "organizationId"=${org}`
    )[0].allowed,
  ).toBe(false);
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=true WHERE "organizationId"=${org}`;
});
it("restricts inbox to managers of the institution and never returns another institution's content", async () => {
  await processWebhookChange(db, org, {
    field: "smb_message_echoes",
    value: {
      messages: [
        {
          id: "wamid.own",
          to: "9647701234567",
          text: { body: "own message" },
          timestamp: "1791363600",
        },
      ],
    },
  });
  await processWebhookChange(db, otherOrg, {
    field: "smb_message_echoes",
    value: {
      messages: [
        {
          id: "wamid.foreign",
          to: "9647701234567",
          text: { body: "FOREIGN SECRET" },
          timestamp: "1791363600",
        },
      ],
    },
  });
  state.session = { user };
  const r = await inbox(
    new NextRequest("http://localhost/api/whatsapp/inbox?phone=9647701234567"),
  );
  expect(r.status).toBe(200);
  const body = await r.text();
  expect(body).toContain("own message");
  expect(body).not.toContain("FOREIGN SECRET");
  await db.user.update({ where: { id: user.id }, data: { role: "CASHIER" } });
  state.session = { user: { ...user, role: "CASHIER" } };
  expect(
    (await inbox(new NextRequest("http://localhost/api/whatsapp/inbox")))
      .status,
  ).toBe(403);
  await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
});

it("cancels and releases only messages that have never reached the provider", async () => {
  await credit();
  const campaignId = randomUUID(),
    ids = Array.from({ length: 5 }, () => randomUUID());
  await db.$executeRaw`INSERT INTO "public"."WaCampaign" (id,"organizationId","templateId",name,"createdBy","previewHash",status) VALUES (${campaignId},${org},${template},'Synthetic cancel',${user.id},'synthetic','QUEUED')`;
  for (const [i, status] of [
    "QUEUED",
    "BLOCKED",
    "SENDING",
    "UNKNOWN",
    "SENT",
  ].entries())
    await db.$executeRaw`INSERT INTO "public"."WaMessage" (id,"organizationId","campaignId","patientId",phone,name,text,parameters,status,"updatedAt") VALUES (${ids[i]},${org},${campaignId},${patient},${"964770123456" + i},'Synthetic','synthetic','[]'::jsonb,${status},NOW())`;
  await db.$transaction((tx) =>
    reserveCampaign(tx, org, campaignId, ids, 60, 1, user.id),
  );
  state.session = { user };
  const cancel = () =>
    campaignAction(
      new NextRequest("http://localhost/api/whatsapp", {
        method: "POST",
        body: JSON.stringify({ action: "cancel", id: campaignId }),
      }),
    );
  expect((await cancel()).status).toBe(200);
  expect((await cancel()).status).toBe(200);
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 820,
    reservedIqd: 180,
  });
  const rows = await db.$queryRaw<
    any[]
  >`SELECT id,status FROM "public"."WaMessage" WHERE "campaignId"=${campaignId}`;
  expect(rows.filter((r) => r.status === "CANCELLED")).toHaveLength(2);
  expect(
    (await walletSummary(db, org)).entries.filter((e) => e.kind === "RELEASE"),
  ).toHaveLength(2);
});

it("charges provider delivery once and preserves a failure code without charging a failed message", async () => {
  await credit();
  const campaignId = randomUUID(),
    id = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaCampaign" (id,"organizationId","templateId",name,"createdBy","previewHash",status) VALUES (${campaignId},${org},${template},'Synthetic delivery',${user.id},'synthetic','RUNNING')`;
  await db.$executeRaw`INSERT INTO "public"."WaMessage" (id,"organizationId","campaignId","patientId",phone,name,text,parameters,status,"providerId","updatedAt") VALUES (${id},${org},${campaignId},${patient},'9647701234567','Synthetic','synthetic','[]'::jsonb,'SENT','wamid.bill',NOW())`;
  await reserve(id);
  const callback = (status: string, providerId = "wamid.bill") =>
    processWebhookChange(db, org, {
      field: "messages",
      value: {
        statuses: [
          {
            id: providerId,
            biz_opaque_callback_data: id,
            recipient_id: "9647701234567",
            status,
            errors: [{ code: 131026 }],
          },
        ],
      },
    });
  await callback("delivered", "wamid.wrong");
  expect((await walletSummary(db, org)).reservedIqd).toBe(60);
  await callback("failed");
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT "providerErrorCode" FROM "public"."WaMessage" WHERE id=${id}`
    )[0].providerErrorCode,
  ).toBe("131026");
  expect((await walletSummary(db, org)).availableIqd).toBe(1000);
  await callback("delivered");
  await callback("read");
  await callback("delivered");
  expect(await walletSummary(db, org)).toMatchObject({
    availableIqd: 940,
    reservedIqd: 0,
  });
  expect(
    (await walletSummary(db, org)).entries.filter((e) => e.kind === "CHARGE"),
  ).toHaveLength(1);
});

it("resumes a saved subscription without repeating uncertain or accepted one-shot sync requests", async () => {
  await connect();
  await db.$executeRaw`UPDATE "public"."WaConnection" SET mode='COEXISTENCE',state='ONBOARDING',"onboardedAt"=NOW(),"contactsSyncState"='REQUESTED',"contactsSyncRequestId"='old-contacts',"historySyncState"='UNKNOWN' WHERE "organizationId"=${org}`;
  await completeSavedCoexistence(db, org, admin);
  expect(
    (fetch as any).mock.calls.filter(([url]: any) =>
      url.includes("smb_app_data"),
    ),
  ).toHaveLength(0);
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT state,"contactsSyncRequestId","historySyncState" FROM "public"."WaConnection" WHERE "organizationId"=${org}`
    )[0],
  ).toMatchObject({
    state: "ACTIVE",
    contactsSyncRequestId: "old-contacts",
    historySyncState: "UNKNOWN",
  });
  await expect(completeSavedCoexistence(db, org, admin)).rejects.toThrow();
});

it("does not request history after the initial 24-hour window", async () => {
  await connect();
  await db.$executeRaw`UPDATE "public"."WaConnection" SET mode='COEXISTENCE',"onboardedAt"=NOW()-INTERVAL '25 hours' WHERE "organizationId"=${org}`;
  await requestInitialSync(db, org, "history");
  expect(fetch).not.toHaveBeenCalled();
});

it("can infer an omitted phone id only when the WABA has one phone", async () => {
  const start = await startSignup(db, org, admin.id);
  await exchangeAttempt(db, org, admin.id, start.id, "fake-code");
  await finishSignup(db, org, admin, start.id, "", "456789");
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT "phoneId","historySyncRequestId" FROM "public"."WaConnection" WHERE "organizationId"=${org}`
    )[0],
  ).toMatchObject({ phoneId: "123456", historySyncRequestId: "fake-sync-id" });
});

it("rejects a foreign signup origin before creating an attempt", async () => {
  expect(
    (
      await signupAction(
        new NextRequest("http://localhost/api/admin/signup", {
          method: "POST",
          headers: { origin: "https://foreign.invalid" },
          body: JSON.stringify({ action: "start" }),
        }),
        context(),
      )
    ).status,
  ).toBe(403);
  expect(
    await db.$queryRaw`SELECT id FROM "public"."WaSignupAttempt" WHERE "organizationId"=${org}`,
  ).toEqual([]);
});

it("paginates equal-timestamp inbox messages without skipping or duplicating any", async () => {
  for (let i = 0; i < 101; i++)
    await processWebhookChange(db, org, {
      field: "smb_message_echoes",
      value: {
        messages: [
          {
            id: "wamid.page." + String(i).padStart(3, "0"),
            to: "9647701234567",
            text: { body: "synthetic " + i },
            timestamp: "1791363600",
          },
        ],
      },
    });
  state.session = { user };
  const first = await (
    await inbox(
      new NextRequest(
        "http://localhost/api/whatsapp/inbox?phone=9647701234567",
      ),
    )
  ).json();
  expect(first.messages).toHaveLength(100);
  const second = await (
    await inbox(
      new NextRequest(
        "http://localhost/api/whatsapp/inbox?phone=9647701234567&before=" +
          encodeURIComponent(first.nextBefore) +
          "&beforeId=" +
          encodeURIComponent(first.nextId),
      ),
    )
  ).json();
  expect(second.messages).toHaveLength(1);
  expect(
    new Set([...first.messages, ...second.messages].map((m) => m.id)).size,
  ).toBe(101);
});

it("stops a message when the connection is disconnected during provider validation", async () => {
  await connect();
  await send({ action: "verify", allocationId: "444444" });
  await credit();
  const campaignId = randomUUID(),
    id = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaCampaign" (id,"organizationId","templateId",name,"createdBy","previewHash",status) VALUES (${campaignId},${org},${template},'Synthetic disconnect',${user.id},'synthetic','QUEUED')`;
  await db.$executeRaw`INSERT INTO "public"."WaMessage" (id,"organizationId","campaignId","patientId",phone,name,text,parameters,status,"updatedAt") VALUES (${id},${org},${campaignId},${patient},'9647701234567','Synthetic','synthetic','[]'::jsonb,'QUEUED',NOW())`;
  await reserve(id);
  const original = fetch;
  const outgoing: string[] = [];
  vi.stubEnv("WHATSAPP_SEND_ENABLED", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: any) => {
      outgoing.push(url);
      if (url.includes("message_templates")) {
        await db.$executeRaw`UPDATE "public"."WaConnection" SET state='DISCONNECTED',"billingVerifiedAt"=NULL WHERE "organizationId"=${org}`;
        return new Response(
          JSON.stringify({
            data: [
              {
                name: "synthetic_template",
                language: "ar",
                status: "APPROVED",
                components: [{ type: "BODY", text: "مرحباً {{1}}" }],
              },
            ],
          }),
        );
      }
      return original(url, options);
    }),
  );
  await runQueue(db, 1);
  expect(outgoing.some((url) => url.endsWith("/messages"))).toBe(false);
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT status FROM "public"."WaMessage" WHERE id=${id}`
    )[0].status,
  ).toBe("BLOCKED");
  expect((await walletSummary(db, org)).reservedIqd).toBe(60);
});
