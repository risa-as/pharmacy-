import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
const state = vi.hoisted(() => ({ db: null as any, session: null as any }));
vi.mock("@/app/lib/prisma", () => ({
  get prisma() {
    return state.db;
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
import { GET, PUT } from "../app/api/admin/whatsapp-pricing/route";
import { prepare, createCampaign } from "../app/lib/whatsapp/store";
import { creditWallet } from "../app/lib/whatsapp/billing";
import { WHATSAPP_IRAQ_REFERENCE } from "../app/lib/whatsapp/pricing";
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
state.db = db;
let orgId: string,
  branchId: string,
  user: any,
  templateId: string,
  patientId: string,
  ctx: any;
let previous: any[];
const ids: string[] = [];
const update = (revision = 0, changes = {}) =>
  PUT(
    new NextRequest("http://test.invalid/api/admin/whatsapp-pricing", {
      method: "PUT",
      body: JSON.stringify({
        revision,
        config: { ...WHATSAPP_IRAQ_REFERENCE, ...changes },
      }),
    }),
  );
const selection = () => ({
  templateId,
  selection: { mode: "ids", ids: [patientId], excludedIds: [], search: "" },
  values: { custom1: "", custom2: "" },
});
beforeAll(async () => {
  previous = await db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaPricingPolicy"`;
  const org = await db.organization.create({
    data: { name: "WA pricing test " + randomUUID() },
  });
  orgId = org.id;
  const branch = await db.branch.create({
    data: { name: "WA pricing test", organizationId: orgId },
  });
  branchId = branch.id;
  user = await db.user.create({
    data: {
      email: "wa-price-" + randomUUID() + "@test.invalid",
      password: "unused",
      name: "Pricing test",
      role: "SUPER_ADMIN",
      branchId,
    },
  });
  const p = await db.patient.create({
    data: { name: "WA pricing patient", phone: "07700000000", branchId },
  });
  patientId = p.id;
  templateId = randomUUID();
  await db.$executeRaw`INSERT INTO "public"."WaTemplateVersion" (id,"organizationId",name,body,language,category,status,"metaName","createdAt") VALUES (${templateId},${orgId},'Pricing test','مرحبًا {{اسم_العميل}}','ar','MARKETING','APPROVED','pricing_test',NOW())`;
  await db.$executeRaw`INSERT INTO "public"."WaConsent" ("organizationId",phone,allowed,evidence,"recordedBy","updatedAt") VALUES (${orgId},'9647700000000',true,'synthetic test',${user.id},NOW())`;
  await creditWallet(db, orgId, user, {
    id: randomUUID(),
    amountIqd: 100000,
    reference: "synthetic pricing balance",
  });
  ctx = { user, organizationId: orgId, tenantBranchWhere: { branchId } };
});
beforeEach(async () => {
  await db.$executeRaw`DELETE FROM "public"."WaPricingPolicy"`;
  state.session = { user };
});
afterAll(async () => {
  for (const table of ["WaWalletEntry", "WaMessageCharge", "WaWallet"])
    await db.$executeRawUnsafe(
      `DELETE FROM "public"."${table}" WHERE "organizationId"=$1`,
      orgId,
    );
  for (const id of ids) {
    await db.$executeRaw`DELETE FROM "public"."WaCampaignAttempt" WHERE "campaignId"=${id}`;
    await db.$executeRaw`DELETE FROM "public"."WaMessage" WHERE "campaignId"=${id}`;
    await db.$executeRaw`DELETE FROM "public"."WaCampaign" WHERE id=${id}`;
  }
  await db.$executeRaw`DELETE FROM "public"."WaTemplateVersion" WHERE id=${templateId}`;
  await db.$executeRaw`DELETE FROM "public"."WaConsent" WHERE "organizationId"=${orgId}`;
  await db.$executeRaw`DELETE FROM "public"."WaPricingPolicy"`;
  for (const p of previous ?? [])
    await db.$executeRaw`INSERT INTO "public"."WaPricingPolicy" (id,revision,config,"updatedBy","updatedAt") VALUES (${p.id},${p.revision},${JSON.stringify(p.config)}::jsonb,${p.updatedBy},${p.updatedAt})`;
  await db.auditLog.deleteMany({ where: { userId: user.id } });
  await db.patient.delete({ where: { id: patientId } });
  await db.user.delete({ where: { id: user.id } });
  await db.branch.delete({ where: { id: branchId } });
  await db.organization.delete({ where: { id: orgId } });
  await db.$disconnect();
});
it("allows only platform administrators to read or change prices", async () => {
  state.session = null;
  expect((await GET()).status).toBe(401);
  expect((await update()).status).toBe(401);
  for (const role of ["ADMIN", "PHARMACIST", "CASHIER"]) {
    state.session = { user: { ...user, role } };
    expect((await GET()).status).toBe(403);
    expect((await update()).status).toBe(403);
  }
  expect(await db.$queryRaw`SELECT * FROM "public"."WaPricingPolicy"`).toEqual(
    [],
  );
});
it("persists prices with an atomic audit entry and rejects stale edits", async () => {
  const before = await db.auditLog.count({ where: { userId: user.id } });
  expect((await update()).status).toBe(200);
  const read = await (await GET()).json();
  expect(read.policy).toEqual({ revision: 1, config: WHATSAPP_IRAQ_REFERENCE });
  expect(await db.auditLog.count({ where: { userId: user.id } })).toBe(
    before + 1,
  );
  expect((await update(0, { marketingUsd: "0.1" })).status).toBe(409);
  expect(await db.auditLog.count({ where: { userId: user.id } })).toBe(
    before + 1,
  );
  expect((await (await GET()).json()).policy.config.marketingUsd).toBe(
    "0.0341",
  );
});
it("rejects invalid config without creating a policy or audit entry", async () => {
  const before = await db.auditLog.count({ where: { userId: user.id } });
  expect((await update(0, { usdToIqd: "-1" })).status).toBe(400);
  expect(await db.$queryRaw`SELECT * FROM "public"."WaPricingPolicy"`).toEqual(
    [],
  );
  expect(await db.auditLog.count({ where: { userId: user.id } })).toBe(before);
});
it("never presents missing settings as a free message and quotes only eligible recipients", async () => {
  expect((await prepare(db, ctx, selection())).pricing).toBeNull();
  await update();
  const p = await prepare(db, ctx, selection());
  expect(p.pricing).toMatchObject({
    messageCount: 1,
    unitPriceIqd: 58,
    totalIqd: 58,
    policyRevision: 1,
  });
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=false WHERE "organizationId"=${orgId}`;
  expect((await prepare(db, ctx, selection())).pricing).toMatchObject({
    messageCount: 0,
    totalIqd: 0,
  });
  await db.$executeRaw`UPDATE "public"."WaConsent" SET allowed=true WHERE "organizationId"=${orgId}`;
});
it("changed rates invalidate an accepted preview without creating messages", async () => {
  await update();
  const p = await prepare(db, ctx, selection());
  await update(1, { marketingUsd: "0.05" });
  const id = randomUUID();
  await expect(
    createCampaign(db, ctx, selection(), id, p.hash, "Stale quote"),
  ).rejects.toThrow("الأسعار");
  expect(
    await db.$queryRaw`SELECT id FROM "public"."WaCampaign" WHERE id=${id}`,
  ).toEqual([]);
  expect(
    await db.$queryRaw`SELECT id FROM "public"."WaMessage" WHERE "campaignId"=${id}`,
  ).toEqual([]);
});
it("concurrent price edits cannot overwrite a newer revision", async () => {
  const before = await db.auditLog.count({ where: { userId: user.id } });
  const responses = await Promise.all([
    update(0, { marketingUsd: "0.04" }),
    update(0, { marketingUsd: "0.05" }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await (await GET()).json()).policy.revision).toBe(1);
  expect(await db.auditLog.count({ where: { userId: user.id } })).toBe(
    before + 1,
  );
});
it("refuses pricing a foreign recipient without creating an outbox", async () => {
  await update();
  await db.patient.update({
    where: { id: patientId },
    data: { phone: "+971500000000" },
  });
  await db.$executeRaw`INSERT INTO "public"."WaConsent" ("organizationId",phone,allowed,evidence,"recordedBy","updatedAt") VALUES (${orgId},'971500000000',true,'synthetic test',${user.id},NOW())`;
  try {
    await expect(prepare(db, ctx, selection())).rejects.toThrow("العراق");
  } finally {
    await db.patient.update({
      where: { id: patientId },
      data: { phone: "07700000000" },
    });
    await db.$executeRaw`DELETE FROM "public"."WaConsent" WHERE "organizationId"=${orgId} AND phone='971500000000'`;
  }
});
it("keeps the original quote on the campaign across edits and duplicate attempts", async () => {
  await update();
  const p = await prepare(db, ctx, selection());
  const id = randomUUID();
  ids.push(id);
  await createCampaign(db, ctx, selection(), id, p.hash, "Frozen quote");
  await update(1, { marketingUsd: "0.05" });
  await createCampaign(db, ctx, selection(), id, p.hash, "Frozen quote");
  const rows = await db.$queryRaw<
    any[]
  >`SELECT "priceQuote" FROM "public"."WaCampaign" WHERE id=${id}`;
  expect(rows[0].priceQuote).toMatchObject({
    totalIqd: 58,
    policyRevision: 1,
    policy: { config: { marketingUsd: "0.0341" } },
  });
  expect(
    (
      await db.$queryRaw<
        any[]
      >`SELECT id FROM "public"."WaMessage" WHERE "campaignId"=${id}`
    ).length,
  ).toBe(1);
});
it("audit failure rolls back a price change", async () => {
  await update();
  state.db = {
    $transaction: (callback: any) =>
      db.$transaction((tx) => {
        const wrapped = new Proxy(tx, {
          get(target, key) {
            if (key === "auditLog")
              return {
                create: async () => {
                  throw Error("synthetic audit failure");
                },
              };
            return Reflect.get(target, key);
          },
        });
        return callback(wrapped);
      }),
  };
  try {
    expect((await update(1, { marketingUsd: "0.1" })).status).toBe(503);
  } finally {
    state.db = db;
  }
  expect((await (await GET()).json()).policy).toMatchObject({
    revision: 1,
    config: { marketingUsd: "0.0341" },
  });
});
