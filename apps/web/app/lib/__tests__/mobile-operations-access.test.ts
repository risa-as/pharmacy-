import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const h = vi.hoisted(() => ({
  ctx: vi.fn(),
  db: {
    branch: { findFirst: vi.fn() },
    supplier: { findMany: vi.fn() },
    stocktake: { findMany: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  feature: vi.fn(),
}));
vi.mock("@/app/lib/tenant-utils", () => ({ getTenantContext: h.ctx }));
vi.mock("@/app/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/app/lib/saas-guards", () => ({ checkFeatureAccess: h.feature }));
import { GET as suppliers } from "../../api/suppliers/route";
import {
  GET as list,
  POST as start,
} from "../../api/inventory/stocktake/route";
import {
  GET as detail,
  PUT as save,
} from "../../api/inventory/stocktake/[id]/route";
const ctx = {
  user: { id: "u", branchId: "own" },
  organizationId: "org",
  tenantBranchWhere: { branchId: "own" },
  branchModelWhere: { id: "own" },
  userPermissions: { canDoStocktake: true, canViewSuppliers: true },
};
beforeEach(() => {
  vi.clearAllMocks();
  h.ctx.mockResolvedValue(ctx);
  h.feature.mockResolvedValue({ allowed: true });
});
it("never substitutes branchId for authentication", async () => {
  h.ctx.mockResolvedValue(NextResponse.json({ error: "no" }, { status: 401 }));
  expect(
    (
      await suppliers(
        new NextRequest("http://local/api/suppliers?branchId=foreign"),
      )
    ).status,
  ).toBe(401);
  expect(h.db.supplier.findMany).not.toHaveBeenCalled();
});
it("checks supplier permission", async () => {
  h.ctx.mockResolvedValue({ ...ctx, userPermissions: {} });
  expect((await suppliers(new NextRequest("http://local/x"))).status).toBe(403);
});
it("intersects requested stocktake branch with session scope", async () => {
  h.db.stocktake.findMany.mockResolvedValue([]);
  await list(new NextRequest("http://local/x?branchId=foreign"));
  expect(h.db.stocktake.findMany.mock.calls[0][0].where).toEqual({
    AND: [{ branchId: "own" }, { branchId: "foreign" }],
  });
});
it("denies foreign branch before creating stocktake", async () => {
  h.db.branch.findFirst.mockResolvedValue(null);
  expect(
    (
      await start(
        new NextRequest("http://local/x", {
          method: "POST",
          body: JSON.stringify({ branchId: "foreign" }),
        }),
      )
    ).status,
  ).toBe(403);
  expect(h.db.$transaction).not.toHaveBeenCalled();
});
it("scopes stocktake detail by branch", async () => {
  h.db.stocktake.findFirst.mockResolvedValue(null);
  expect(
    (
      await detail(new NextRequest("http://local/x"), {
        params: Promise.resolve({ id: "foreign" }),
      })
    ).status,
  ).toBe(404);
  expect(h.db.stocktake.findFirst.mock.calls[0][0].where).toEqual({
    AND: [{ branchId: "own" }, { id: "foreign" }],
  });
});
it("denies revoked counting permission", async () => {
  h.ctx.mockResolvedValue({ ...ctx, userPermissions: {} });
  expect(
    (
      await save(
        new NextRequest("http://local/x", { method: "PUT", body: "{}" }),
        { params: Promise.resolve({ id: "s" }) },
      )
    ).status,
  ).toBe(403);
  expect(h.db.$transaction).not.toHaveBeenCalled();
});

it("rejects a stocktake when stock changed since counting", async () => {
  const tx: any = {
    $queryRaw: vi.fn(),
    stocktake: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "s", branchId: "own", status: "PENDING" }),
    },
    batch: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "b", quantity: 4, costPrice: 100 }),
      update: vi.fn(),
    },
  };
  h.db.$transaction.mockImplementation((fn: any) => fn(tx));
  const result = await save(
    new NextRequest("http://local/x", {
      method: "PUT",
      body: JSON.stringify({
        status: "COMPLETED",
        items: [{ batchId: "b", systemQuantity: 5, actualQuantity: 5 }],
      }),
    }),
    { params: Promise.resolve({ id: "s" }) },
  );
  expect(result.status).toBe(409);
  expect(tx.batch.update).not.toHaveBeenCalled();
});
it("takes stocktake cost from server rather than client", async () => {
  const tx: any = {
    $queryRaw: vi.fn(),
    stocktake: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "s", branchId: "own", status: "PENDING" }),
      update: vi.fn().mockResolvedValue({ id: "s" }),
    },
    batch: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "b", quantity: 5, costPrice: 100 }),
      update: vi.fn(),
    },
    stocktakeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    expense: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  h.db.$transaction.mockImplementation((fn: any) => fn(tx));
  const result = await save(
    new NextRequest("http://local/x", {
      method: "PUT",
      body: JSON.stringify({
        status: "COMPLETED",
        items: [
          {
            batchId: "b",
            systemQuantity: 5,
            actualQuantity: 4,
            reason: "",
            reasonCode: "DAMAGE",
            costPrice: 9999,
          },
        ],
      }),
    }),
    { params: Promise.resolve({ id: "s" }) },
  );
  expect(result.status).toBe(200);
  expect(tx.expense.create).not.toHaveBeenCalled();
  expect(tx.stocktake.update.mock.calls[0][0].data.status).toBe("REVIEW");
  expect(tx.stocktakeItem.createMany.mock.calls[0][0].data[0].costPrice).toBe(
    100,
  );
});
it("repeated stocktake approval does not adjust stock twice", async () => {
  const tx: any = {
    $queryRaw: vi.fn(),
    stocktake: {
      findFirst: vi.fn().mockResolvedValue({ id: "s", status: "COMPLETED" }),
    },
    batch: { update: vi.fn() },
  };
  h.db.$transaction.mockImplementation((fn: any) => fn(tx));
  expect(
    (
      await save(
        new NextRequest("http://local/x", {
          method: "PUT",
          body: JSON.stringify({ status: "COMPLETED", items: [] }),
        }),
        { params: Promise.resolve({ id: "s" }) },
      )
    ).status,
  ).toBe(200);
  expect(tx.batch.update).not.toHaveBeenCalled();
});

it.each(["PENDING", "COMPLETED"])(
  "allows optional notes without turning unknown shortage into expense: %s",
  async (status) => {
    const tx: any = {
      $queryRaw: vi.fn(),
      stocktake: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "s", branchId: "own", status: "PENDING" }),
        update: vi.fn().mockResolvedValue({ id: "s", status }),
      },
      batch: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "b", quantity: 5, costPrice: 100 }),
        update: vi.fn(),
      },
      stocktakeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      expense: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    h.db.$transaction.mockImplementation((fn: any) => fn(tx));
    const result = await save(
      new NextRequest("http://local/x", {
        method: "PUT",
        body: JSON.stringify({
          status,
          items: [
            { batchId: "b", systemQuantity: 5, actualQuantity: 3, reason: "" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "s" }) },
    );
    expect(result.status).toBe(200);
    expect(tx.expense.create).not.toHaveBeenCalled();
    expect(tx.batch.update).not.toHaveBeenCalled();
    expect(tx.stocktakeItem.createMany.mock.calls[0][0].data[0]).toMatchObject({
      actualQuantity: 3,
      difference: -2,
    });
    expect(
      JSON.parse(tx.auditLog.create.mock.calls[0][0].data.details)
        .classifications[0].reasonCode,
    ).toBe("UNKNOWN");
  },
);

it.each(["CORRECTION", "UNRECORDED", "DAMAGE"])(
  "charges only explicitly confirmed damage and never nets gains against it: %s",
  async (reasonCode) => {
    const tx: any = {
      $queryRaw: vi.fn(),
      stocktake: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "s", branchId: "own", status: "PENDING" }),
        update: vi.fn().mockResolvedValue({ id: "s" }),
      },
      batch: {
        findFirst: vi
          .fn()
          .mockImplementation(({ where }: any) => ({
            id: where.id,
            quantity: 5,
            costPrice: 100,
          })),
        update: vi.fn(),
      },
      stocktakeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
      expense: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    h.db.$transaction.mockImplementation((fn: any) => fn(tx));
    const result = await save(
      new NextRequest("http://local/x", {
        method: "PUT",
        body: JSON.stringify({
          status: "COMPLETED",
          items: [
            { batchId: "b", systemQuantity: 5, actualQuantity: 3, reasonCode },
            {
              batchId: "c",
              systemQuantity: 5,
              actualQuantity: 10,
              reasonCode: "CORRECTION",
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "s" }) },
    );
    expect(result.status).toBe(200);
    expect(tx.expense.create).not.toHaveBeenCalled();
    expect(tx.batch.update).not.toHaveBeenCalled();
    expect(tx.stocktake.update.mock.calls[0][0].data.status).toBe("REVIEW");
  },
);

 it('restores saved classifications and keeps legacy notes without assuming damage', async () => {
   const { readStocktakeReason } = await import('../stocktake-reasons');
   expect(readStocktakeReason('تصنيف الجرد: تلف مؤكد\n')).toEqual({reasonCode:'DAMAGE',reason:''});
   expect(readStocktakeReason('old note')).toEqual({reasonCode:'UNKNOWN',reason:'old note'});
 });
