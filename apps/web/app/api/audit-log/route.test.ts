import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const h = vi.hoisted(() => ({
  ctx: null as any,
  session: { user: { id: "actor" } } as any,
  db: {
    branch: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/app/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("@/app/lib/tenant-utils", () => ({
  getTenantContext: async () => h.ctx,
}));
import { GET, POST } from "./route";
const req = (q = "") =>
  new NextRequest("http://test.invalid/api/audit-log" + q);
beforeEach(() => {
  vi.clearAllMocks();
  h.session = { user: { id: "actor" } };
  h.ctx = {
    user: { id: "actor", name: "Actor", role: "ADMIN", branchId: "own" },
    organizationId: "org",
    branchModelWhere: { organizationId: "org" },
    userPermissions: { canViewAuditLog: true },
  };
  h.db.branch.findMany.mockResolvedValue([{ id: "own" }]);
  h.db.user.findMany.mockResolvedValue([{ id: "actor" }]);
  h.db.auditLog.findMany.mockResolvedValue([]);
  h.db.auditLog.count.mockResolvedValue(0);
  h.db.auditLog.create.mockImplementation(async (a: any) => ({
    id: "log",
    ...a.data,
  }));
});
it("search cannot replace organization scope", async () => {
  expect((await GET(req("?search=secret"))).status).toBe(200);
  const where = h.db.auditLog.findMany.mock.calls[0][0].where;
  expect(where.AND).toContainEqual({
    OR: [
      { branchId: { in: ["own"] } },
      { branchId: null, userId: { in: ["actor"] } },
    ],
  });
  expect(where.AND).toContainEqual({
    OR: expect.arrayContaining([
      { userName: { contains: "secret", mode: "insensitive" } },
    ]),
  });
  expect(h.db.auditLog.count.mock.calls[0][0].where).toEqual(where);
});
it("permitted employee is scoped to own branch even when another branch is requested", async () => {
  h.ctx.user.role = "PHARMACIST";
  h.ctx.branchModelWhere = { id: "own" };
  expect((await GET(req("?branchId=foreign"))).status).toBe(200);
  expect(h.db.branch.findMany).toHaveBeenCalledWith({
    where: { id: "own" },
    select: { id: true },
  });
  expect(h.db.user.findMany).toHaveBeenCalledWith({
    where: { branchId: "own" },
    select: { id: true },
  });
  expect(h.db.auditLog.findMany.mock.calls[0][0].where.AND[0].OR[0]).toEqual({
    branchId: { in: ["own"] },
  });
  expect(h.db.auditLog.findMany.mock.calls[0][0].where.AND).toContainEqual({
    branchId: "foreign",
  });
});
it("Baghdad dates are inclusive and page size bounded", async () => {
  expect(
    (await GET(req("?from=2026-10-05&to=2026-10-05&limit=10000"))).status,
  ).toBe(200);
  const a = h.db.auditLog.findMany.mock.calls[0][0];
  expect(a.take).toBe(100);
  expect(a.where.AND).toContainEqual({
    createdAt: {
      gte: new Date("2026-10-04T21:00:00Z"),
      lte: new Date("2026-10-05T20:59:59.999Z"),
    },
  });
});
it("invalid dates and pagination do not query logs", async () => {
  for (const q of [
    "?from=2026-02-30",
    "?from=2026-10-06&to=2026-10-05",
    "?page=-1",
    "?limit=abc",
  ])
    expect((await GET(req(q))).status).toBe(400);
  expect(h.db.auditLog.findMany).not.toHaveBeenCalled();
});
it("denies anonymous callers or users without permission", async () => {
  h.session = null;
  expect((await GET(req())).status).toBe(401);
  h.session = { user: { id: "actor" } };
  h.ctx.userPermissions.canViewAuditLog = false;
  expect((await GET(req())).status).toBe(403);
  expect(h.db.auditLog.findMany).not.toHaveBeenCalled();
});
it("fails closed on missing organization and revoked session", async () => {
  h.ctx.organizationId = undefined;
  expect((await GET(req())).status).toBe(403);
  h.ctx = NextResponse.json({ error: "revoked" }, { status: 401 });
  expect((await GET(req())).status).toBe(401);
});
it("super admin can view cross-branch scope", async () => {
  h.ctx.user.role = "SUPER_ADMIN";
  expect((await GET(req("?action=DELETE"))).status).toBe(200);
  expect(h.db.branch.findMany).not.toHaveBeenCalled();
  expect(h.db.auditLog.findMany.mock.calls[0][0].where.AND).toEqual([
    {},
    { action: "DELETE" },
  ]);
});
it("client cannot forge a confirmed sale or another actor", async () => {
  const response = await POST(
    new NextRequest("http://test.invalid/api/audit-log", {
      method: "POST",
      body: JSON.stringify({
        userId: "other",
        branchId: "foreign",
        action: "CREATE",
        entity: "SALE",
        entityId: "fake",
        details: { source: "desktop-sync", total: 500 },
      }),
    }),
  );
  expect(response.status).toBe(200);
  const a = h.db.auditLog.create.mock.calls[0][0].data;
  expect(a).toMatchObject({
    userId: "actor",
    branchId: "own",
    action: "CLIENT_EVENT",
    entity: "CLIENT_EVENT",
  });
  expect(JSON.parse(a.details)).toMatchObject({
    source: "client-report",
    reportedAction: "CREATE",
    reportedEntity: "SALE",
  });
});
it("invalid client report creates nothing", async () => {
  expect(
    (
      await POST(
        new NextRequest("http://test.invalid/api/audit-log", {
          method: "POST",
          body: '{"action":"","entity":"SALE"}',
        }),
      )
    ).status,
  ).toBe(400);
  expect(h.db.auditLog.create).not.toHaveBeenCalled();
});
it("failure returns 500 instead of an empty success", async () => {
  h.db.auditLog.findMany.mockRejectedValueOnce(Error("synthetic outage"));
  expect((await GET(req())).status).toBe(500);
});
