import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { randomUUID, createHmac } from "node:crypto";
const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock("@/app/lib/prisma", () => ({
  get prisma() {
    return state.db;
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { GET, POST } from "../app/api/whatsapp/route";
import { GET as workerRoute } from "../app/api/whatsapp/worker/route";
import { POST as webhook } from "../app/api/whatsapp/webhook/[organizationId]/route";
import { runQueue } from "../app/lib/whatsapp/worker";
import { WHATSAPP_IRAQ_REFERENCE } from "../app/lib/whatsapp/pricing";
import { creditWallet } from "../app/lib/whatsapp/billing";
let previousPricing: any[];
import { saveConnection } from "../app/lib/whatsapp/store";
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
state.db = db;
let f: any,
  templateId: string,
  providerMode = "success",
  providerCategory = "UTILITY";
const calls: string[] = [];
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/whatsapp", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const as = (u: any) => {
  state.session = { user: { id: u.id, role: u.role, branchId: u.branchId } };
};
const selection = (ids?: string[]) => ({
  mode: ids ? "ids" : "filtered",
  ids: ids ?? [],
  excludedIds: [],
  search: "",
  branchId: f.a.id,
});
const preview = (ids?: string[], scheduledAt: string | null = null) =>
  post({
    action: "preview",
    templateId,
    scheduledAt,
    selection: selection(ids),
    values: { custom1: "ساعات العمل 8–10", custom2: "" },
  });
async function makeCampaign(
  ids = [f.p1.id],
  scheduledAt: string | null = null,
) {
  const p = await (await preview(ids, scheduledAt)).json();
  expect(p.count).toBe(1);
  const id = randomUUID(),
    body = {
      action: "create",
      id,
      name: "اختبار حملة",
      templateId,
      scheduledAt,
      selection: selection(ids),
      values: { custom1: "ساعات العمل 8–10", custom2: "" },
      hash: p.hash,
    };
  const r = await post(body);
  expect(r.status).toBe(200);
  return { id, body };
}
beforeAll(async () => {
  process.env.WHATSAPP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  process.env.META_GRAPH_VERSION = "v99.0";
  const orgA = await db.organization.create({
      data: { name: "WA-A " + randomUUID() },
    }),
    orgB = await db.organization.create({
      data: { name: "WA-B " + randomUUID() },
    });
  const a = await db.branch.create({
      data: { name: "A", organizationId: orgA.id },
    }),
    other = await db.branch.create({
      data: { name: "A2", organizationId: orgA.id },
    }),
    b = await db.branch.create({
      data: { name: "B", organizationId: orgB.id },
    });
  const user = await db.user.create({
    data: {
      email: `wa-${randomUUID()}@test.invalid`,
      password: "unused",
      name: "WA Test",
      role: "ADMIN",
      branchId: a.id,
    },
  });
  const foreign = await db.user.create({
    data: {
      email: `wa-${randomUUID()}@test.invalid`,
      password: "unused",
      role: "ADMIN",
      branchId: b.id,
    },
  });
  const cashier = await db.user.create({
    data: {
      email: `wa-${randomUUID()}@test.invalid`,
      password: "unused",
      role: "CASHIER",
      branchId: a.id,
    },
  });
  const p = (name: string, phone: string, branchId: string) =>
    db.patient.create({
      data: { name, phone, branchId, allergies: [], chronicDiseases: [] },
    });
  const p1 = await p("Own", "07701234567", a.id),
    dup = await p("Duplicate", "+9647701234567", a.id),
    no = await p("No consent", "07701234568", a.id),
    bad = await p("Invalid", "abc", a.id),
    fp = await p("FOREIGN", "07701234569", b.id),
    op = await p("OTHER BRANCH", "07701234560", other.id);
  f = {
    orgA,
    orgB,
    a,
    b,
    other,
    user,
    foreign,
    cashier,
    p1,
    dup,
    no,
    bad,
    fp,
    op,
  };
  templateId = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaTemplateVersion" (id,"organizationId",name,body,language,category,status,"metaId","metaName","createdAt") VALUES (${templateId},${orgA.id},'Test','مرحبًا {{اسم_العميل}}: {{نص_1}}','ar','UTILITY','APPROVED','meta','approved_test',NOW())`;
  await saveConnection(db, orgA.id, {
    phoneId: "123456",
    businessId: "456789",
    token: "test-token-not-real",
    appSecret: "test-secret-not-real",
  });
  await saveConnection(db, orgB.id, {
    phoneId: "654321",
    businessId: "456789",
    token: "test-token-not-real",
    appSecret: "test-secret-not-real",
  });
  previousPricing = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaPricingPolicy"`;
  await db.$executeRaw`DELETE FROM "public"."WaPricingPolicy"`;
  await db.$executeRaw`INSERT INTO "public"."WaPricingPolicy" (id,revision,config,"updatedBy") VALUES ('singleton',1,${JSON.stringify(WHATSAPP_IRAQ_REFERENCE)}::jsonb,${user.id})`;
  await creditWallet(db, orgA.id, user, {
    id: randomUUID(),
    amountIqd: 100000,
    reference: "synthetic funded fixture",
  });
  await db.$executeRaw`UPDATE "public"."WaConnection" SET "allocationId"='222222',"fundingId"='333333',"billingVerifiedAt"=NOW() WHERE "organizationId"=${orgA.id}`;
  as(user);
  expect(
    (
      await post({
        action: "consent",
        patientId: p1.id,
        allowed: true,
        evidence: "موافقة اختبار معزول",
      })
    ).status,
  ).toBe(200);
});
beforeEach(async () => {
  as(f.user);
  process.env.WHATSAPP_SEND_ENABLED = "true";
  process.env.WHATSAPP_META_CREDIT_LINE_ID = "111111";
  process.env.WHATSAPP_META_SYSTEM_TOKEN = "synthetic-system-token-for-tests";
  providerMode = "success";
  providerCategory = "UTILITY";
  calls.length = 0;
  await db.user.update({
    where: { id: f.user.id },
    data: { permissions: null, isActive: true, role: "ADMIN" },
  });
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=true WHERE "organizationId"=${f.orgA.id} AND phone='9647701234567'`;
  // Isolate each test's queue; never touch another suite's fixture.
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET status='CANCELLED' WHERE "organizationId"=${f.orgA.id}`;
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET "createdAt"=NOW()-INTERVAL '2 minutes' WHERE "organizationId"=${f.orgA.id}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: any) => {
      calls.push(String(url));
      if (String(url).includes("owning_credit"))
        return new Response(JSON.stringify({ data: [{ id: "222222" }] }));
      if (String(url).includes("receiving_credential"))
        return new Response(
          JSON.stringify({
            id: "222222",
            receiving_credential: { id: "333333" },
          }),
        );
      if (String(url).includes("primary_funding_id"))
        return new Response(
          JSON.stringify({ id: "456789", primary_funding_id: "333333" }),
        );
      if (String(url).includes("/messages")) {
        if (providerMode === "timeout") throw Error("lost answer");
        if (providerMode === "reject")
          return new Response(JSON.stringify({ error: { code: 131026 } }), {
            status: 400,
          });
        const payload = JSON.parse(options.body);
        return new Response(
          JSON.stringify({
            messages: [{ id: "wamid." + payload.biz_opaque_callback_data }],
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              name: "approved_test",
              status: "APPROVED",
              category: providerCategory,
              language: "ar",
              components: [{ type: "BODY", text: "مرحبًا {{1}}: {{2}}" }],
            },
          ],
        }),
      );
    }),
  );
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const k of [
    "WHATSAPP_ENCRYPTION_KEY",
    "META_GRAPH_VERSION",
    "WHATSAPP_SEND_ENABLED",
    "WHATSAPP_META_CREDIT_LINE_ID",
    "WHATSAPP_META_SYSTEM_TOKEN",
  ])
    delete process.env[k];
  if (f) {
    await db.$executeRaw`DELETE FROM "public"."WaPricingPolicy"`;
    for (const p of previousPricing ?? [])
      await db.$executeRaw`INSERT INTO "public"."WaPricingPolicy" (id,revision,config,"updatedBy","updatedAt") VALUES (${p.id},${p.revision},${JSON.stringify(p.config)}::jsonb,${p.updatedBy},${p.updatedAt})`;
    for (const org of [f.orgA.id, f.orgB.id]) {
      for (const table of [
        "WaWalletEntry",
        "WaMessageCharge",
        "WaWallet",
        "WaWebhookEvent",
        "WaInboxMessage",
      ])
        await db.$executeRawUnsafe(
          `DELETE FROM "public"."${table}" WHERE "organizationId"=$1`,
          org,
        );
      await db.$executeRaw`DELETE FROM "public"."WaCampaignAttempt" WHERE "organizationId"=${org}`;
      await db.$executeRaw`DELETE FROM "public"."WaMessage" WHERE "organizationId"=${org}`;
      await db.$executeRaw`DELETE FROM "public"."WaCampaign" WHERE "organizationId"=${org}`;
      await db.$executeRaw`DELETE FROM "public"."WaTemplateVersion" WHERE "organizationId"=${org}`;
      await db.$executeRaw`DELETE FROM "public"."WaConsent" WHERE "organizationId"=${org}`;
      await db.$executeRaw`DELETE FROM "public"."WaConnection" WHERE "organizationId"=${org}`;
    }
    await db.auditLog.deleteMany({
      where: { userId: { in: [f.user.id, f.foreign.id, f.cashier.id] } },
    });
    await db.patient.deleteMany({
      where: { branchId: { in: [f.a.id, f.other.id, f.b.id] } },
    });
    await db.user.deleteMany({
      where: { id: { in: [f.user.id, f.foreign.id, f.cashier.id] } },
    });
    await db.branch.deleteMany({
      where: { id: { in: [f.a.id, f.other.id, f.b.id] } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [f.orgA.id, f.orgB.id] } },
    });
  }
  await db.$disconnect();
});
it("syncs the category approved by Meta and refuses unsupported classifications", async () => {
  as(f.user);
  providerCategory = "MARKETING";
  try {
    expect((await post({ action: "sync", id: templateId })).status).toBe(200);
    let rows = await db.$queryRaw<
      any[]
    >`SELECT category FROM "public"."WaTemplateVersion" WHERE id=${templateId}`;
    expect(rows[0].category).toBe("MARKETING");
    providerCategory = "AUTHENTICATION";
    expect((await post({ action: "sync", id: templateId })).status).toBe(409);
    rows = await db.$queryRaw<
      any[]
    >`SELECT category FROM "public"."WaTemplateVersion" WHERE id=${templateId}`;
    expect(rows[0].category).toBe("MARKETING");
  } finally {
    await db.$executeRaw`UPDATE "public"."WaTemplateVersion" SET category='UTILITY' WHERE id=${templateId}`;
  }
});
it("requires an authenticated session and denies a cashier before creating any campaign", async () => {
  state.session = null;
  expect(
    (await GET(new NextRequest("http://localhost/api/whatsapp"))).status,
  ).toBe(401);
  as(f.cashier);
  expect((await post({ action: "template", name: "x" })).status).toBe(403);
});
it("scopes filtered selection, consent and templates to the current organization", async () => {
  const p = await (await preview()).json();
  expect(p.count).toBe(1);
  expect(p.excluded).toHaveLength(3);
  expect(JSON.stringify(p)).not.toContain("FOREIGN");
  expect(
    (
      await post({
        action: "consent",
        patientId: f.fp.id,
        allowed: true,
        evidence: "not allowed",
      })
    ).status,
  ).toBe(404);
  as(f.foreign);
  expect((await preview([f.p1.id])).status).toBe(404);
});
it("uses live granted permission but does not let a branch cashier select another branch", async () => {
  await db.user.update({
    where: { id: f.cashier.id },
    data: { permissions: JSON.stringify({ canSendWhatsAppCampaigns: true }) },
  });
  as(f.cashier);
  const r = await post({
    action: "preview",
    templateId,
    selection: { ...selection(), branchId: f.other.id },
    values: { custom1: "test", custom2: "" },
  });
  expect(r.status).toBe(200);
  expect((await r.json()).count).toBe(0);
});
it("rejects a client-marked approved draft and keeps templates append-only", async () => {
  const r = await post({
    action: "template",
    name: "new",
    body: "مرحبًا {{اسم_العميل}}",
    category: "UTILITY",
    status: "APPROVED",
  });
  expect(r.status).toBe(200);
  const t = await r.json();
  expect(
    (
      await post({
        action: "preview",
        templateId: t.id,
        selection: selection([f.p1.id]),
      })
    ).status,
  ).toBe(400);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaTemplateVersion" WHERE id=${t.id}`;
  expect(rows[0].status).toBe("DRAFT");
});
it("persists immutable text once and repeated campaign attempts create no second outbox", async () => {
  const c = await makeCampaign();
  expect((await post(c.body)).status).toBe(200);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].text).toBe("مرحبًا Own: ساعات العمل 8–10");
  expect(calls).toHaveLength(0);
  as(f.foreign);
  expect(
    (
      await GET(
        new NextRequest("http://localhost/api/whatsapp?campaignId=" + c.id),
      )
    ).status,
  ).toBe(404);
  expect((await post(c.body)).status).toBe(409);
});
it("invalidates the preview when patient data or consent change", async () => {
  const p = await (await preview([f.no.id])).json();
  expect(p.count).toBe(0);
  await post({
    action: "consent",
    patientId: f.no.id,
    allowed: true,
    evidence: "موافقة جديدة موثقة",
  });
  expect(
    (
      await post({
        action: "create",
        id: randomUUID(),
        name: "changed",
        templateId,
        selection: selection([f.no.id]),
        values: { custom1: "ساعات العمل 8–10", custom2: "" },
        hash: p.hash,
      })
    ).status,
  ).toBe(409);
});
it("claims each outbox entry only once even with two workers running concurrently", async () => {
  const c = await makeCampaign();
  await Promise.all([runQueue(db, 2), runQueue(db, 2)]);
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(1);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status,"providerId" FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  expect(rows[0].status).toBe("SENT");
  expect(rows[0].providerId).toMatch(/^wamid/);
});
it("retains an unknown send after a lost reply and does not send again", async () => {
  const c = await makeCampaign();
  providerMode = "timeout";
  await runQueue(db);
  await runQueue(db);
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(1);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  expect(rows[0].status).toBe("UNKNOWN");
});
it("does not send after an opt-out, a disabled account or revoked sending permission", async () => {
  const c = await makeCampaign();
  await post({
    action: "consent",
    patientId: f.p1.id,
    allowed: false,
    evidence: "إلغاء الاشتراك للاختبار",
  });
  await runQueue(db);
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(0);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  expect(rows[0].status).toBe("BLOCKED");
});
it("blocks queued work when the creator permission is revoked", async () => {
  await makeCampaign();
  await db.user.update({
    where: { id: f.user.id },
    data: { permissions: JSON.stringify({ canSendWhatsAppCampaigns: false }) },
  });
  await runQueue(db);
  expect(calls).toHaveLength(0);
});
it("stops a cancelled campaign and rejects an unprotected worker endpoint", async () => {
  const c = await makeCampaign();
  expect((await post({ action: "cancel", id: c.id })).status).toBe(200);
  await runQueue(db);
  expect(calls).toHaveLength(0);
  delete process.env.WHATSAPP_WORKER_SECRET;
  expect(
    (await workerRoute(new Request("http://localhost/api/whatsapp/worker")))
      .status,
  ).toBe(401);
});
it("fails closed when sending is disabled", async () => {
  process.env.WHATSAPP_SEND_ENABLED = "false";
  const p = await (await preview([f.p1.id])).json();
  expect(
    (
      await post({
        action: "create",
        id: randomUUID(),
        name: "disabled",
        templateId,
        selection: selection([f.p1.id]),
        values: { custom1: "ساعات العمل 8–10", custom2: "" },
        hash: p.hash,
      })
    ).status,
  ).toBe(503);
  expect((await runQueue(db)).enabled).toBe(false);
  expect(calls).toHaveLength(0);
});
it("authenticates webhooks and resolves unknown sends by the callback id without resending", async () => {
  const c = await makeCampaign();
  providerMode = "timeout";
  await runQueue(db);
  const messages = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  const body = JSON.stringify({
    entry: [
      {
        id: "456789",
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456" },
              statuses: [
                {
                  id: "real-id",
                  recipient_id: "9647701234567",
                  status: "read",
                  biz_opaque_callback_data: messages[0].id,
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const request = (signature: string) =>
    new NextRequest("http://localhost/webhook", {
      method: "POST",
      body,
      headers: { "x-hub-signature-256": signature },
    });
  expect(
    (
      await webhook(request("bad"), {
        params: Promise.resolve({ organizationId: f.orgA.id }),
      })
    ).status,
  ).toBe(403);
  const signature =
    "sha256=" +
    createHmac("sha256", "test-secret-not-real").update(body).digest("hex");
  expect(
    (
      await webhook(request(signature), {
        params: Promise.resolve({ organizationId: f.orgA.id }),
      })
    ).status,
  ).toBe(200);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE id=${messages[0].id}`;
  expect(rows[0].status).toBe("READ");
  const campaigns = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaCampaign" WHERE id=${c.id}`;
  expect(campaigns[0].status).toBe("COMPLETE");
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(1);
});
it("coalesces simultaneous campaigns with different ids and identical recipient snapshots", async () => {
  const p = await (await preview([f.p1.id])).json();
  const body = {
    action: "create",
    name: "two tabs",
    templateId,
    selection: selection([f.p1.id]),
    values: { custom1: "ساعات العمل 8–10", custom2: "" },
    hash: p.hash,
  };
  const first = randomUUID(),
    second = randomUUID();
  const results = await Promise.all([
    post({ ...body, id: first }),
    post({ ...body, id: second }),
  ]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  const ids = await Promise.all(results.map(async (r) => (await r.json()).id));
  expect(ids[0]).toBe(ids[1]);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT id FROM "public"."WaMessage" WHERE "campaignId"=${ids[0]}`;
  expect(rows).toHaveLength(1);
  // A lost response from either tab must remain idempotent beyond the
  // coalescing window, even after consent changes or the campaign completes.
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET "createdAt"=NOW()-INTERVAL '2 minutes' WHERE id=${ids[0]}`;
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=false WHERE "organizationId"=${f.orgA.id}`;
  expect((await (await post({ ...body, id: second })).json()).id).toBe(ids[0]);
});
it("resumes only messages blocked before sending, never unknown attempts", async () => {
  const c = await makeCampaign();
  await db.user.update({ where: { id: f.user.id }, data: { isActive: false } });
  await runQueue(db);
  expect(calls).toHaveLength(0);
  await db.user.update({ where: { id: f.user.id }, data: { isActive: true } });
  expect((await post({ action: "resume", id: c.id })).status).toBe(200);
  providerMode = "timeout";
  await runQueue(db, 1);
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(1);
  expect((await post({ action: "resume", id: c.id })).status).toBe(409);
  await runQueue(db);
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(1);
});
it("records failed delivery after SENT, ignores late SENT and honors signed opt-out", async () => {
  const c = await makeCampaign();
  await runQueue(db, 1);
  const messages = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  const deliver = async (value: any) => {
    const body = JSON.stringify({
      entry: [
        {
          id: "456789",
          changes: [
            { value: { metadata: { phone_number_id: "123456" }, ...value } },
          ],
        },
      ],
    });
    return webhook(
      new NextRequest("http://localhost/webhook", {
        method: "POST",
        body,
        headers: {
          "x-hub-signature-256":
            "sha256=" +
            createHmac("sha256", "test-secret-not-real")
              .update(body)
              .digest("hex"),
        },
      }),
      { params: Promise.resolve({ organizationId: f.orgA.id }) },
    );
  };
  const s = {
    id: messages[0].providerId,
    recipient_id: "9647701234567",
    biz_opaque_callback_data: messages[0].id,
  };
  expect(
    (await deliver({ statuses: [{ ...s, status: "failed" }] })).status,
  ).toBe(200);
  expect((await deliver({ statuses: [{ ...s, status: "sent" }] })).status).toBe(
    200,
  );
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE id=${messages[0].id}`;
  expect(rows[0].status).toBe("FAILED");
  await deliver({
    messages: [{ from: "9647701234567", text: { body: "إيقاف" } }],
  });
  const consent = await db.$queryRaw<
    any[]
  >`SELECT allowed FROM "public"."WaConsent" WHERE "organizationId"=${f.orgA.id} AND phone='9647701234567'`;
  expect(consent[0].allowed).toBe(false);
});
it("atomically cancels an unrecorded attempt and refuses a late create request", async () => {
  const p = await (await preview([f.p1.id])).json(),
    id = randomUUID();
  const body = {
    action: "create",
    id,
    name: "late",
    templateId,
    selection: selection([f.p1.id]),
    values: { custom1: "ساعات العمل 8–10", custom2: "" },
    hash: p.hash,
  };
  const resolved = await post({ action: "resolve", id });
  expect(resolved.status).toBe(200);
  expect(await resolved.json()).toEqual({ state: "CANCELLED" });
  expect((await post(body)).status).toBe(409);
  expect(
    await db.$queryRaw<
      any[]
    >`SELECT id FROM "public"."WaCampaign" WHERE id=${id}`,
  ).toHaveLength(0);
  expect(await (await post({ action: "resolve", id })).json()).toEqual({
    state: "CANCELLED",
  });
});
it("resolves a recorded campaign without cancelling it or creating another one", async () => {
  const c = await makeCampaign();
  expect(await (await post({ action: "resolve", id: c.id })).json()).toEqual({
    state: "RECORDED",
    id: c.id,
  });
  await runQueue(db, 1);
  expect(calls.filter((x) => x.includes("/messages"))).toHaveLength(1);
  as(f.foreign);
  expect((await post({ action: "resolve", id: c.id })).status).toBe(404);
});
it("serializes simultaneous create and resolution of the same attempt", async () => {
  const p = await (await preview([f.p1.id])).json(),
    id = randomUUID();
  const body = {
    action: "create",
    id,
    name: "race",
    templateId,
    selection: selection([f.p1.id]),
    values: { custom1: "ساعات العمل 8–10", custom2: "" },
    hash: p.hash,
  };
  const [created, resolved] = await Promise.all([
    post(body),
    post({ action: "resolve", id }),
  ]);
  expect(resolved.status).toBe(200);
  const result = await resolved.json(),
    rows = await db.$queryRaw<
      any[]
    >`SELECT id FROM "public"."WaCampaign" WHERE id=${id}`;
  if (result.state === "RECORDED") {
    expect(created.status).toBe(200);
    expect(rows).toHaveLength(1);
  } else {
    expect(result.state).toBe("CANCELLED");
    expect(created.status).toBe(409);
    expect(rows).toHaveLength(0);
    expect((await post(body)).status).toBe(409);
  }
});
it("keeps the WhatsApp organization boundary even for a platform administrator", async () => {
  await db.user.update({
    where: { id: f.user.id },
    data: { role: "SUPER_ADMIN" },
  });
  as({ ...f.user, role: "SUPER_ADMIN" });
  const response = await post({
    action: "preview",
    templateId,
    selection: { mode: "filtered", ids: [], excludedIds: [], search: "" },
    values: { custom1: "test", custom2: "" },
  });
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json())).not.toContain("FOREIGN");
  expect(
    (
      await post({
        action: "consent",
        patientId: f.fp.id,
        allowed: true,
        evidence: "foreign not allowed",
      })
    ).status,
  ).toBe(404);
});
it("preserves a failure callback received before the provider HTTP response", async () => {
  const c = await makeCampaign(),
    original = global.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, options: any) => {
      if (String(url).includes("owning_credit"))
        return new Response(JSON.stringify({ data: [{ id: "222222" }] }));
      if (String(url).includes("receiving_credential"))
        return new Response(
          JSON.stringify({
            id: "222222",
            receiving_credential: { id: "333333" },
          }),
        );
      if (String(url).includes("primary_funding_id"))
        return new Response(
          JSON.stringify({ id: "456789", primary_funding_id: "333333" }),
        );
      if (String(url).includes("/messages")) {
        const payload = JSON.parse(options.body),
          id = "wamid." + payload.biz_opaque_callback_data;
        const body = JSON.stringify({
          entry: [
            {
              id: "456789",
              changes: [
                {
                  value: {
                    metadata: { phone_number_id: "123456" },
                    statuses: [
                      {
                        id,
                        recipient_id: payload.to,
                        status: "failed",
                        biz_opaque_callback_data:
                          payload.biz_opaque_callback_data,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });
        const sig =
          "sha256=" +
          createHmac("sha256", "test-secret-not-real")
            .update(body)
            .digest("hex");
        await webhook(
          new NextRequest("http://localhost/webhook", {
            method: "POST",
            body,
            headers: { "x-hub-signature-256": sig },
          }),
          { params: Promise.resolve({ organizationId: f.orgA.id }) },
        );
      }
      return original(url, options);
    }),
  );
  await runQueue(db, 1);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT status,error FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  expect(rows[0].status).toBe("FAILED");
  expect(rows[0].error).toBeTruthy();
  expect((await post({ action: "resume", id: c.id })).status).toBe(409);
});

it("holds scheduled messages until due, then sends each message once", async () => {
  const later = new Date(Date.now() + 3600000).toISOString();
  const c = await makeCampaign([f.p1.id], later);
  let rows = await db.$queryRaw<
    any[]
  >`SELECT status,"scheduledAt" FROM "public"."WaCampaign" WHERE id=${c.id}`;
  expect(rows[0].scheduledAt.toISOString()).toBe(later);
  expect((await runQueue(db, 4)).processed).toBe(0);
  expect(calls).toHaveLength(0);
  rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
  expect(rows.map((r) => r.status)).toEqual(["QUEUED"]);
  const list = await (
    await GET(new NextRequest("http://localhost/api/whatsapp"))
  ).json();
  expect(list.campaigns.find((r: any) => r.id === c.id).scheduledAt).toBe(
    later,
  );
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET "scheduledAt"=NOW()-INTERVAL '1 minute' WHERE id=${c.id}`;
  await Promise.all([runQueue(db, 1), runQueue(db, 1)]);
  await runQueue(db, 4);
  expect(calls.filter((url) => url.includes("/messages"))).toHaveLength(1);
});

it("binds the preview to the schedule and rejects expired schedules without creating messages", async () => {
  const first = new Date(Date.now() + 3600000).toISOString();
  const second = new Date(Date.now() + 7200000).toISOString();
  const p = await (await preview([f.p1.id], first)).json();
  const p2 = await (await preview([f.p1.id], second)).json();
  expect(p.hash).not.toBe(p2.hash);
  const id = randomUUID();
  const body = {
    action: "create",
    id,
    name: "Scheduled test",
    templateId,
    selection: selection([f.p1.id]),
    values: { custom1: "ساعات العمل 8–10", custom2: "" },
    hash: p.hash,
    scheduledAt: second,
  };
  expect((await post(body)).status).toBe(409);
  expect(
    (
      await post({
        ...body,
        scheduledAt: new Date(Date.now() - 60000).toISOString(),
      })
    ).status,
  ).toBe(400);
  const rows = await db.$queryRaw<
    any[]
  >`SELECT id FROM "public"."WaCampaign" WHERE id=${id}`;
  expect(rows).toHaveLength(0);
  expect(
    (await preview([f.p1.id], new Date(Date.now() - 60000).toISOString()))
      .status,
  ).toBe(400);
});

it("keeps retries of a recorded schedule idempotent even after its due time passes", async () => {
  const c = await makeCampaign(
    [f.p1.id],
    new Date(Date.now() + 3600000).toISOString(),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 7200000);
  try {
    const r = await post(c.body);
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe(c.id);
    const rows = await db.$queryRaw<
      any[]
    >`SELECT id FROM "public"."WaMessage" WHERE "campaignId"=${c.id}`;
    expect(rows).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});

it("cancels future sending and enforces consent and permissions again at the due time", async () => {
  const c = await makeCampaign(
    [f.p1.id],
    new Date(Date.now() + 3600000).toISOString(),
  );
  expect((await post({ action: "cancel", id: c.id })).status).toBe(200);
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET "scheduledAt"=NOW()-INTERVAL '1 minute' WHERE id=${c.id}`;
  await runQueue(db, 4);
  expect(calls).toHaveLength(0);

  // A different time yields a distinct preview, not the one-minute duplicate.
  const d = await makeCampaign(
    [f.p1.id],
    new Date(Date.now() + 7200000).toISOString(),
  );
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET "scheduledAt"=NOW()-INTERVAL '1 minute' WHERE id=${d.id}`;
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=false WHERE "organizationId"=${f.orgA.id} AND phone='9647701234567'`;
  await runQueue(db, 4);
  expect(calls).toHaveLength(0);
  let rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE "campaignId"=${d.id}`;
  expect(rows[0].status).toBe("BLOCKED");
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=true WHERE "organizationId"=${f.orgA.id} AND phone='9647701234567'`;
  const e = await makeCampaign(
    [f.p1.id],
    new Date(Date.now() + 10800000).toISOString(),
  );
  await db.$executeRaw`UPDATE "public"."WaCampaign" SET "scheduledAt"=NOW()-INTERVAL '1 minute' WHERE id=${e.id}`;
  await db.user.update({
    where: { id: f.user.id },
    data: { permissions: JSON.stringify({ canSendWhatsAppCampaigns: false }) },
  });
  await runQueue(db, 4);
  expect(calls).toHaveLength(0);
  rows = await db.$queryRaw<
    any[]
  >`SELECT status FROM "public"."WaMessage" WHERE "campaignId"=${e.id}`;
  expect(rows[0].status).toBe("BLOCKED");
});
