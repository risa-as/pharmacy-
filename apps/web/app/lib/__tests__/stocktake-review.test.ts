import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const h = vi.hoisted(() => ({ ctx: vi.fn(), db: { $transaction: vi.fn() } }));
vi.mock("@/app/lib/tenant-utils", () => ({ getTenantContext: h.ctx }));
vi.mock("@/app/lib/prisma", () => ({ prisma: h.db }));
import { PUT } from "../../api/inventory/stocktake/[id]/route";
const context = {
  user: { id: "manager", name: "Manager", role: "MANAGER" },
  tenantBranchWhere: { branchId: "own" },
  userPermissions: { canDoStocktake: true },
};
let current: any;
let tx: any;
beforeEach(() => {
  vi.clearAllMocks();
  h.ctx.mockResolvedValue(context);
  current = {
    id: "s",
    branchId: "own",
    status: "REVIEW",
    items: [
      {
        batchId: "a",
        systemQuantity: 10,
        actualQuantity: 7,
        costPrice: 100,
        reason: "",
      },
      {
        batchId: "b",
        systemQuantity: 10,
        actualQuantity: 8,
        costPrice: 100,
        reason: "تصنيف الجرد: تلف مؤكد\n",
      },
      {
        batchId: "c",
        systemQuantity: 10,
        actualQuantity: 20,
        costPrice: 100,
        reason: "",
      },
    ],
  };
  tx = {
    $queryRaw: vi.fn(),
    stocktake: {
      findFirst: vi.fn().mockImplementation(() => current),
      update: vi.fn().mockImplementation(({ data }: any) => {
        current = { ...current, ...data };
        return current;
      }),
    },
    batch: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: any) => ({
          id: where.id,
          quantity: 10,
          costPrice: 100,
        })),
      update: vi.fn(),
    },
    stocktakeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    expense: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  h.db.$transaction.mockImplementation((fn: any) => fn(tx));
});
const call = (body: any) =>
  PUT(
    new NextRequest("http://local/x", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "s" }) },
  );
it("manager posts stored counts and separate shortage/damage expenses once, ignoring submitted replacements", async () => {
  expect((await call({ action: "APPROVE", items: [] })).status).toBe(200);
  expect(tx.batch.update).toHaveBeenCalledTimes(3);
  expect(
    tx.expense.create.mock.calls.map((c: any) => [
      c[0].data.category,
      c[0].data.amount,
    ]),
  ).toEqual([
    ["عجز جرد", 300],
    ["توالف مؤكدة بالجرد", 200],
  ]);
  expect(current.status).toBe("COMPLETED");
  expect((await call({ action: "APPROVE" })).status).toBe(200);
  expect(tx.batch.update).toHaveBeenCalledTimes(3);
  expect(tx.expense.create).toHaveBeenCalledTimes(2);
});
it.each(["APPROVE", "RECOUNT"])(
  "pharmacist cannot perform manager action %s",
  async (action) => {
    h.ctx.mockResolvedValue({
      ...context,
      user: { ...context.user, role: "PHARMACIST" },
    });
    expect((await call({ action })).status).toBe(403);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  },
);
it("recount archives evidence and reopens without stock or expense writes", async () => {
  expect((await call({ action: "RECOUNT" })).status).toBe(200);
  expect(current.status).toBe("PENDING");
  expect(tx.batch.update).not.toHaveBeenCalled();
  expect(tx.expense.create).not.toHaveBeenCalled();
  expect(
    JSON.parse(tx.auditLog.create.mock.calls[0][0].data.details).previousItems,
  ).toHaveLength(3);
});
it("changed stock blocks manager approval before any writes", async () => {
  tx.batch.findFirst.mockResolvedValue({
    id: "a",
    quantity: 9,
    costPrice: 100,
  });
  expect((await call({ action: "APPROVE" })).status).toBe(409);
  expect(tx.batch.update).not.toHaveBeenCalled();
  expect(tx.expense.create).not.toHaveBeenCalled();
});
it("foreign stocktake is inaccessible", async () => {
  tx.stocktake.findFirst.mockResolvedValue(null);
  expect((await call({ action: "APPROVE" })).status).toBe(409);
  expect(tx.expense.create).not.toHaveBeenCalled();
  expect(tx.stocktake.findFirst.mock.calls[0][0].where.AND).toContainEqual({
    branchId: "own",
  });
});
it("ordinary resubmission cannot bypass manager review", async () => {
  expect((await call({ status: "COMPLETED", items: [] })).status).toBe(200);
  expect(current.status).toBe("REVIEW");
  expect(tx.batch.update).not.toHaveBeenCalled();
  expect(tx.expense.create).not.toHaveBeenCalled();
});

it("keeps the manager recount note for the employee and in the audit", async()=>{
 const result=await call({action:"RECOUNT",reviewNote:"أعد عد دفعة Brufen"});
 expect(result.status).toBe(200);
 expect(tx.stocktake.update.mock.calls[0][0].data.notes).toContain("أعد عد دفعة Brufen");
 expect(JSON.parse(tx.auditLog.create.mock.calls[0][0].data.details).reviewNote).toBe("أعد عد دفعة Brufen");
 expect(tx.batch.update).not.toHaveBeenCalled();
});
