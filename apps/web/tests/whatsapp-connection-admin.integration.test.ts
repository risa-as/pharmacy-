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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { GET, PUT } from "../app/api/admin/organizations/[id]/whatsapp/route";
import {
  GET as pharmacyRead,
  POST as pharmacyWrite,
} from "../app/api/whatsapp/route";
import { connection } from "../app/lib/whatsapp/store";
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
state.db = db;
let a: any, b: any, branch: any, admin: any, owner: any;
const token = "synthetic-token-not-real-123456";
const appSecret = "synthetic-secret-not-real-123456";
let ownsPhone = true;
const provider = vi.fn(
  async () =>
    new Response(
      JSON.stringify({
        data: ownsPhone ? [{ id: "123456789" }, { id: "987654321" }] : [],
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
);
const context = (id = a.id) => ({ params: Promise.resolve({ id }) });
const read = (id = a.id) =>
  GET(
    new NextRequest("http://test.invalid/api/admin/organizations/whatsapp"),
    context(id),
  );
const write = (changes = {}, id = a.id) =>
  PUT(
    new NextRequest("http://test.invalid/api/admin/organizations/whatsapp", {
      method: "PUT",
      body: JSON.stringify({
        phoneId: "123456789",
        businessId: "555555555",
        token,
        appSecret,
        revision: null,
        ...changes,
      }),
    }),
    context(id),
  );
const rows = () =>
  db.$queryRaw<
    any[]
  >`SELECT * FROM "public"."WaConnection" WHERE "organizationId" IN (${a.id},${b.id}) ORDER BY "organizationId"`;
beforeAll(async () => {
  process.env.WHATSAPP_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  process.env.META_GRAPH_VERSION = "v99.0";
  vi.stubGlobal("fetch", provider);
  a = await db.organization.create({
    data: { name: "Synthetic WA admin A " + randomUUID() },
  });
  b = await db.organization.create({
    data: { name: "Synthetic WA admin B " + randomUUID() },
  });
  branch = await db.branch.create({
    data: { name: "Test", organizationId: a.id },
  });
  admin = await db.user.create({
    data: {
      email: randomUUID() + "@test.invalid",
      name: "Platform test",
      password: "unused",
      role: "SUPER_ADMIN",
    },
  });
  owner = await db.user.create({
    data: {
      email: randomUUID() + "@test.invalid",
      password: "unused",
      role: "ADMIN",
      branchId: branch.id,
    },
  });
});
beforeEach(async () => {
  await db.$executeRaw`DELETE FROM "public"."WaConnection" WHERE "organizationId" IN (${a.id},${b.id})`;
  await db.auditLog.deleteMany({ where: { userId: admin.id } });
  await db.user.update({
    where: { id: admin.id },
    data: { isActive: true, role: "SUPER_ADMIN" },
  });
  state.session = { user: admin };
  ownsPhone = true;
  provider.mockClear();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$executeRaw`DELETE FROM "public"."WaConnection" WHERE "organizationId" IN (${a.id},${b.id})`;
  await db.auditLog.deleteMany({
    where: { userId: { in: [admin.id, owner.id] } },
  });
  await db.user.deleteMany({ where: { id: { in: [admin.id, owner.id] } } });
  await db.branch.delete({ where: { id: branch.id } });
  await db.organization.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await db.$disconnect();
});
it("requires a session and denies all pharmacy/warehouse roles without provider calls or writes", async () => {
  state.session = null;
  expect((await read()).status).toBe(401);
  expect((await write()).status).toBe(401);
  for (const role of [
    "ADMIN",
    "MANAGER",
    "PHARMACIST",
    "CASHIER",
    "WAREHOUSE_OWNER",
  ]) {
    state.session = { user: { ...owner, role } };
    expect((await read()).status).toBe(403);
    expect((await write()).status).toBe(403);
  }
  expect(provider).not.toHaveBeenCalled();
  expect(await rows()).toEqual([]);
  expect(await db.auditLog.count({ where: { userId: admin.id } })).toBe(0);
});
it("checks current administrator status even if the cookie still claims SUPER_ADMIN", async () => {
  await db.user.update({ where: { id: admin.id }, data: { role: "CASHIER" } });
  expect((await read()).status).toBe(403);
  expect((await write()).status).toBe(403);
  await db.user.update({
    where: { id: admin.id },
    data: { role: "SUPER_ADMIN", isActive: false },
  });
  expect((await write()).status).toBe(403);
  expect(await rows()).toEqual([]);
  expect(provider).not.toHaveBeenCalled();
});
it("rejects missing organizations and invalid or organization-overriding payloads before verification", async () => {
  expect((await read(randomUUID())).status).toBe(404);
  expect((await write({}, randomUUID())).status).toBe(404);
  expect((await write({ token: "short" })).status).toBe(400);
  expect((await write({ organizationId: b.id })).status).toBe(400);
  expect(provider).not.toHaveBeenCalled();
  expect(await rows()).toEqual([]);
});
it("saves scoped encrypted credentials and atomic audit, and never returns saved secrets on reads", async () => {
  expect((await read()).headers.get("Cache-Control")).toBe("no-store");
  const response = await write();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const result = await response.json();
  const saved = await connection(db, a.id);
  expect(saved).toMatchObject({
    token,
    appSecret,
    phoneId: "123456789",
    verifyToken: result.verifyToken,
  });
  const stored = (await rows())[0];
  expect(stored.tokenEncrypted).not.toContain(token);
  expect(stored.secretEncrypted).not.toContain(appSecret);
  expect(stored.verifyEncrypted).not.toContain(result.verifyToken);
  const metadata = await (await read()).json();
  expect(metadata).toEqual({
    connection: {
      phoneId: "123456789",
      businessId: "555555555",
      updatedAt: result.revision,
    },
    webhookPath: `/api/whatsapp/webhook/${a.id}`,
  });
  expect(await (await read(b.id)).json()).toMatchObject({ connection: null });
  const audit = await db.auditLog.findFirstOrThrow({
    where: { userId: admin.id },
  });
  expect(audit.entityId).toBe(a.id);
  for (const secret of [token, appSecret, result.verifyToken]) {
    expect(JSON.stringify(metadata)).not.toContain(secret);
    expect(JSON.stringify(audit)).not.toContain(secret);
  }
});
it("keeps each organization's existing connection when a different organization is configured", async () => {
  expect((await write()).status).toBe(200);
  const before = (await rows()).find((r) => r.organizationId === a.id);
  expect((await write({ phoneId: "987654321" }, b.id)).status).toBe(200);
  expect((await rows()).find((r) => r.organizationId === a.id)).toEqual(before);
  expect((await connection(db, b.id))?.phoneId).toBe("987654321");
});
it("rejects an unowned or already-used phone without changing existing connections", async () => {
  expect((await write()).status).toBe(200);
  const before = await rows();
  ownsPhone = false;
  expect((await write({ phoneId: "987654321" }, b.id)).status).toBe(400);
  expect(await rows()).toEqual(before);
  ownsPhone = true;
  expect((await write({}, b.id)).status).toBe(409);
  expect(await rows()).toEqual(before);
});
it("rejects stale edits and rolls back a connection if the audit cannot be recorded", async () => {
  const first = await (await write()).json();
  const before = await rows();
  expect((await write({ token: token + "-new" })).status).toBe(409);
  expect(await rows()).toEqual(before);
  // Make the audit FK fail after the connection write within the transaction.
  const tx = db.$transaction.bind(db);
  const spy = vi.spyOn(db, "$transaction").mockImplementation(((
    callback: any,
  ) =>
    tx((t: any) =>
      callback(
        new Proxy(t, {
          get(target, prop) {
            if (prop === "auditLog")
              return {
                create: () => {
                  throw new Error("Synthetic audit failure");
                },
              };
            return Reflect.get(target, prop);
          },
        }),
      ),
    )) as any);
  try {
    expect(
      (await write({ revision: first.revision, token: token + "-new" })).status,
    ).toBe(503);
  } finally {
    spy.mockRestore();
  }
  expect(await rows()).toEqual(before);
});
it("updates only with the current revision and issues a new webhook verification token", async () => {
  const first = await (await write()).json();
  const response = await write({
    revision: first.revision,
    token: token + "-updated",
  });
  expect(response.status).toBe(200);
  const second = await response.json();
  expect(second.verifyToken).not.toBe(first.verifyToken);
  expect(Date.parse(second.revision)).toBeGreaterThan(
    Date.parse(first.revision),
  );
  expect((await connection(db, a.id))?.token).toBe(token + "-updated");
  expect((await (await read()).json()).connection.updatedAt).toBe(
    second.revision,
  );
  expect(await db.auditLog.count({ where: { userId: admin.id } })).toBe(2);
});
it("serializes two initial saves so only one administrator's edit is accepted", async () => {
  const responses = await Promise.all([
    write(),
    write({ phoneId: "987654321" }),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await rows()).toHaveLength(1);
  expect(await db.auditLog.count({ where: { userId: admin.id } })).toBe(1);
});
it("closes the old connection action and exposes only configuration status to the pharmacy", async () => {
  expect((await write()).status).toBe(200);
  const before = await rows();
  state.session = { user: owner };
  const response = await pharmacyWrite(
    new NextRequest("http://test.invalid/api/whatsapp", {
      method: "POST",
      body: JSON.stringify({
        action: "connection",
        phoneId: "987654321",
        businessId: "555555555",
        token,
        appSecret,
      }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await rows()).toEqual(before);
  const data = await (
    await pharmacyRead(new NextRequest("http://test.invalid/api/whatsapp"))
  ).json();
  expect(data.connection).toEqual({
    configured: true,
    mode: "MANUAL",
    state: "ACTIVE",
    billingReady: false,
  });
  expect(data.permissions.connect).toBe(false);
  expect(data).not.toHaveProperty("settings");
  expect(JSON.stringify(data)).not.toContain("123456789");
  expect(JSON.stringify(data)).not.toContain(token);
  expect(provider).toHaveBeenCalledTimes(1);
});
