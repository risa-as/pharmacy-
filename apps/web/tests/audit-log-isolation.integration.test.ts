import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
const h = vi.hoisted(() => ({ db: null as any, ctx: null as any }));
vi.mock("@/app/lib/prisma", () => ({
  get prisma() {
    return h.db;
  },
}));
vi.mock("@/auth", () => ({ auth: async () => ({ user: h.ctx.user }) }));
vi.mock("@/app/lib/tenant-utils", () => ({
  getTenantContext: async () => h.ctx,
}));
import { GET, POST } from "../app/api/audit-log/route";
const url = process.env.TEST_DATABASE_URL!;
if (
  !url ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  new URL(url).pathname !== "/faramace_readiness"
)
  throw Error("Isolated database only");
const db = new PrismaClient({ datasources: { db: { url } } });
h.db = db;
const key = "audit-verify-" + randomUUID();
let a: any, b: any, b1: any, b2: any, b3: any, u1: any, u2: any, u3: any;
beforeAll(async () => {
  a = await db.organization.create({ data: { name: key + "-own" } });
  b = await db.organization.create({ data: { name: key + "-other" } });
  b1 = await db.branch.create({
    data: { name: "Own branch", organizationId: a.id },
  });
  b2 = await db.branch.create({
    data: { name: "Other own branch", organizationId: a.id },
  });
  b3 = await db.branch.create({
    data: { name: "Foreign organization", organizationId: b.id },
  });
  u1 = await db.user.create({
    data: {
      email: key + "-a@test.invalid",
      password: "synthetic",
      role: "ADMIN",
      branchId: b1.id,
    },
  });
  u2 = await db.user.create({
    data: {
      email: key + "-b@test.invalid",
      password: "synthetic",
      role: "ADMIN",
      branchId: b2.id,
    },
  });
  u3 = await db.user.create({
    data: {
      email: key + "-c@test.invalid",
      password: "synthetic",
      role: "ADMIN",
      branchId: b3.id,
    },
  });
  await db.auditLog.createMany({
    data: [
      {
        userId: u1.id,
        userName: key,
        action: "CREATE",
        entity: "SALE",
        branchId: b1.id,
        createdAt: new Date("2026-10-04T21:00:00Z"),
      },
      {
        userId: u2.id,
        userName: key,
        action: "UPDATE",
        entity: "USER",
        branchId: b2.id,
        createdAt: new Date("2026-10-05T20:59:59.999Z"),
      },
      {
        userId: u3.id,
        userName: key,
        action: "DELETE",
        entity: "USER",
        branchId: b3.id,
      },
      {
        userId: u1.id,
        userName: key,
        action: "EXPORT",
        entity: "BACKUP",
        branchId: null,
        createdAt: new Date("2026-10-04T20:59:59.999Z"),
      },
      {
        userId: u3.id,
        userName: key,
        action: "EXPORT",
        entity: "BACKUP",
        branchId: null,
      },
    ],
  });
});
beforeEach(() => {
  h.ctx = {
    user: {
      id: u1.id,
      role: "ADMIN",
      name: "Synthetic actor",
      branchId: b1.id,
    },
    organizationId: a.id,
    branchModelWhere: { organizationId: a.id },
    userPermissions: { canViewAuditLog: true },
  };
});
const get = (p: Record<string, string> = {}) =>
  GET(
    new NextRequest(
      "http://test.invalid/api/audit-log?" +
        new URLSearchParams({ search: key, ...p }),
    ),
  );
it("search returns only own organization, including own null-branch history", async () => {
  const r = await get();
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.pagination.total).toBe(3);
  expect(j.logs.map((v: any) => v.userId)).not.toContain(u3.id);
});
it("a foreign branch or actor filter cannot bypass scope", async () => {
  for (const p of [{ branchId: b3.id }, { userId: u3.id }]) {
    const r = await get(p);
    expect(r.status).toBe(200);
    expect((await r.json()).logs).toEqual([]);
  }
});
it("employee with permission sees own branch only, not other branches of same organization", async () => {
  h.ctx.user.role = "PHARMACIST";
  h.ctx.branchModelWhere = { id: b1.id };
  const j = await (await get()).json();
  expect(j.pagination.total).toBe(2);
  expect(j.logs.every((v: any) => v.userId === u1.id)).toBe(true);
});
it("Baghdad date boundaries include midnight and final millisecond, not previous day", async () => {
  const j = await (await get({ from: "2026-10-05", to: "2026-10-05" })).json();
  expect(j.pagination.total).toBe(2);
  expect(j.logs.map((v: any) => v.action).sort()).toEqual(["CREATE", "UPDATE"]);
});
it("all filters keep accurate counts across pages", async () => {
  const j = await (await get({ page: "2", limit: "1" })).json();
  expect(j.logs).toHaveLength(1);
  expect(j.pagination).toMatchObject({ page: 2, total: 3, totalPages: 3 });
  const k = await (await get({ action: "CREATE" })).json();
  expect(k.pagination.total).toBe(1);
});
it("untrusted client report is recorded as a report and cannot spoof server sale", async () => {
  const r = await POST(
    new NextRequest("http://test.invalid/api/audit-log", {
      method: "POST",
      body: JSON.stringify({
        action: "DELETE",
        entity: "SALE",
        userId: u3.id,
        details: { source: "desktop-sync" },
      }),
    }),
  );
  expect(r.status).toBe(200);
  const j = await r.json();
  expect(j.log).toMatchObject({
    userId: u1.id,
    action: "CLIENT_EVENT",
    entity: "CLIENT_EVENT",
  });
  expect(JSON.parse(j.log.details).source).toBe("client-report");
});
afterAll(async () => {
  const ids = [u1?.id, u2?.id, u3?.id].filter(Boolean);
  await db.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.branch.deleteMany({
    where: { id: { in: [b1?.id, b2?.id, b3?.id].filter(Boolean) } },
  });
  await db.organization.deleteMany({
    where: { id: { in: [a?.id, b?.id].filter(Boolean) } },
  });
  await db.$disconnect();
});
