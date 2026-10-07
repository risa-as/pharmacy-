import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const h = vi.hoisted(() => ({
  ctx: null as any,
  db: { user: { findMany: vi.fn() }, branch: { findMany: vi.fn() } },
}));
vi.mock("@/app/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/app/lib/tenant-utils", () => ({
  getTenantContext: async () => h.ctx,
}));
vi.mock("@/app/lib/page-guards", () => ({ requireFeature: async () => null }));
vi.mock("@/app/ui/reports/audit-log-client", () => ({ default: () => null }));
import Page from "./page";
beforeEach(() => {
  vi.clearAllMocks();
  h.ctx = {
    userPermissions: { canViewAuditLog: true },
    organizationId: "org",
    tenantBranchWhere: { branchId: "own" },
    branchModelWhere: { id: "own" },
  };
  h.db.user.findMany.mockResolvedValue([]);
  h.db.branch.findMany.mockResolvedValue([]);
});
it("branch options use the Branch model scope instead of a nonexistent branchId field", async () => {
  await Page();
  expect(h.db.branch.findMany).toHaveBeenCalledWith({
    where: { id: "own" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
});
it("without permission no employee or branch data is loaded", async () => {
  h.ctx.userPermissions.canViewAuditLog = false;
  expect(renderToStaticMarkup(await Page())).toContain("ليس لديك صلاحية");
  expect(h.db.user.findMany).not.toHaveBeenCalled();
  expect(h.db.branch.findMany).not.toHaveBeenCalled();
});
it("page describes recorded activity without claiming complete coverage", async () => {
  expect(renderToStaticMarkup(await Page())).toContain(
    "لا يعني بالضرورة وجود نشاط مقابل هنا",
  );
});
