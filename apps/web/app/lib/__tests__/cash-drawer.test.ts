import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  tenant: vi.fn(),
  branches: vi.fn(),
  safes: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("../action-tenant", () => ({ requireActionTenant: m.tenant }));
vi.mock("../prisma", () => ({
  prisma: {
    branch: { findMany: m.branches },
    safe: { findMany: m.safes },
    $transaction: m.transaction,
  },
}));
import { cleanCashFilter, getCashDrawerLedger } from "../cash-drawer";
beforeEach(() => {
  vi.resetAllMocks();
  m.tenant.mockResolvedValue({
    branchModelWhere: { organizationId: "org-a" },
    tenantBranchWhere: { branch: { organizationId: "org-a" } },
  });
  m.branches.mockResolvedValue([{ id: "a", name: "A" }]);
  m.safes.mockResolvedValue([{ id: "drawer-a", name: "Main", balance: 80 }]);
});
it("checks the sidebar permission before reading data", async () => {
  m.tenant.mockRejectedValue(Error("denied"));
  await expect(getCashDrawerLedger()).rejects.toThrow("denied");
  expect(m.tenant).toHaveBeenCalledWith("canViewExpenses", "read");
  expect(m.branches).not.toHaveBeenCalled();
});
it("rejects a foreign branch without querying its drawers", async () => {
  await expect(getCashDrawerLedger("foreign")).rejects.toThrow(
    "الفرع خارج نطاق حسابك",
  );
  expect(m.safes).not.toHaveBeenCalled();
});
it("does not guess between multiple drawers", async () => {
  m.safes.mockResolvedValue([{ id: "one" }, { id: "two" }]);
  expect(await getCashDrawerLedger()).toMatchObject({ state: "ambiguous" });
  expect(m.transaction).not.toHaveBeenCalled();
});
it("scopes the ledger and bounds pagination on one snapshot", async () => {
  const read = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValueOnce(101).mockResolvedValueOnce(2);
  m.transaction.mockImplementation(async (fn) =>
    fn({
      safe: {
        findFirstOrThrow: async () => ({
          id: "drawer-a",
          name: "Main",
          balance: 80,
        }),
      },
      transaction: {
        count,
        findMany: read,
        findFirst: async () => null,
        groupBy: async () => [
          { type: "IN", _sum: { amount: 100 } },
          { type: "OUT", _sum: { amount: 20 } },
        ],
      },
    }),
  );
  expect(await getCashDrawerLedger("a", 999999)).toMatchObject({
    state: "ready",
    page: 3,
    pages: 3,
    incoming: 100,
    outgoing: 20,
    unlinked: 2,
  });
  expect(read).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        safeId: "drawer-a",
        safe: { branch: { organizationId: "org-a" } },
      },
      take: 50,
      skip: 100,
    }),
  );
  expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  });
});
it("filters listed rows only, keeping totals and the per-kind breakdown for the whole drawer", async () => {
  const read = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(3);
  const groupBy = vi
    .fn()
    .mockResolvedValueOnce([
      { type: "IN", referenceType: "SALE", _sum: { amount: 900 }, _count: 9 },
      { type: "OUT", referenceType: "SALE_RETURN", _sum: { amount: 50 }, _count: 1 },
      { type: "OUT", referenceType: "EXPENSE", _sum: { amount: 100 }, _count: 2 },
    ])
    .mockResolvedValueOnce([{ type: "IN", _sum: { amount: 300 }, _count: 3 }]);
  m.transaction.mockImplementation(async (fn) =>
    fn({
      safe: { findFirstOrThrow: async () => ({ id: "drawer-a", name: "Main", balance: 750 }) },
      transaction: { count, findMany: read, groupBy, findFirst: async () => ({ createdAt: new Date(0) }) },
    }),
  );
  const filter = cleanCashFilter({ direction: "OUT", kind: "EXPENSE" });
  const data = await getCashDrawerLedger("a", 1, filter);
  expect(data).toMatchObject({
    incoming: 900,
    outgoing: 150,
    today: { incoming: 300, outgoing: 0, inCount: 3, outCount: 0 },
    byKind: [
      { kind: "SALE", incoming: 900, outgoing: 0, count: 9 },
      { kind: "EXPENSE", incoming: 0, outgoing: 100, count: 2 },
      { kind: "SALE_RETURN", incoming: 0, outgoing: 50, count: 1 },
    ],
  });
  const scoped = { safeId: "drawer-a", safe: { branch: { organizationId: "org-a" } } };
  expect(read.mock.calls[0][0].where).toEqual({ ...scoped, type: "OUT", referenceType: "EXPENSE" });
  expect(count.mock.calls[0][0].where).toEqual({ ...scoped, type: "OUT", referenceType: "EXPENSE" });
  expect(groupBy.mock.calls[0][0].where).toEqual(scoped);
});
it("ignores unknown filter values from the URL", () => {
  expect(cleanCashFilter({ direction: "SIDEWAYS", kind: "DROP TABLE" })).toEqual({ direction: undefined, kind: undefined });
  expect(cleanCashFilter({ direction: "IN", kind: "SALE" })).toEqual({ direction: "IN", kind: "SALE" });
});
