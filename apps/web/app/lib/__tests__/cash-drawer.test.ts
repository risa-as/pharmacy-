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
import { getCashDrawerLedger } from "../cash-drawer";
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
