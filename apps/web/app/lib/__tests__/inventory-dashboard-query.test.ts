import { describe, expect, it } from "vitest";
import {
  buildInventoryCountsQuery,
  buildInventoryPageIdsQuery,
  normalizeInventoryDashboardPage,
} from "../inventory-dashboard-query";

function sqlText(query: { text?: string; sql?: string }): string {
  return query.text ?? query.sql ?? "";
}

describe("inventory dashboard SQL builders", () => {
  it.each([0.5, -1, NaN, Infinity, -Infinity, undefined, null, "invalid"])(
    "normalizes invalid page %s to one",
    (page) => expect(normalizeInventoryDashboardPage(page)).toBe(1),
  );

  it("floors fractional pages and bounds huge offsets", () => {
    expect(normalizeInventoryDashboardPage(2.9)).toBe(2);
    const query = buildInventoryPageIdsQuery({
      page: Number.MAX_VALUE, query: "", status: "", tenantBranchWhere: {},
    });
    expect(query.values).toEqual([50, 2_147_483_600]);
  });

  it("preserves spaces in search terms and branch identifiers", () => {
    const query = buildInventoryCountsQuery({
      query: " Drug ", tenantBranchWhere: {}, branchId: " branch ",
    });
    expect(query.values).toEqual([" branch ", "% Drug %", "% Drug %", "% Drug %"]);
  });

  it("intersects cashier scope with a requested branch instead of replacing it", () => {
    const query = buildInventoryPageIdsQuery({
      page: 1,
      query: "",
      status: "",
      tenantBranchWhere: { branchId: "cashier-branch" },
      branchId: "requested-branch",
    });

    expect(sqlText(query)).toContain('i."branchId" = $1 AND i."branchId" = $2');
    expect(query.values).toContain("cashier-branch");
    expect(query.values).toContain("requested-branch");
  });

  it("keeps admin organization scope while applying requested branch", () => {
    const query = buildInventoryCountsQuery({
      query: "",
      tenantBranchWhere: { branch: { organizationId: "org-1" } },
      branchId: "branch-2",
    });

    expect(sqlText(query)).toContain('br."organizationId" = $1 AND i."branchId" = $2');
    expect(query.values).toEqual(["org-1", "branch-2"]);
  });

  it("fails closed for unknown tenant scope shapes", () => {
    const query = buildInventoryCountsQuery({
      query: "",
      tenantBranchWhere: { branchId: { in: ["b1", "b2"] } },
    });

    expect(sqlText(query)).toContain("WHERE FALSE");
    expect(query.values).toEqual([]);
  });

  it("parameterizes search text and preserves inventory status boundaries", () => {
    const query = buildInventoryPageIdsQuery({
      page: 1,
      query: "amox%' OR 1=1 --",
      status: "low",
      tenantBranchWhere: {},
    });

    expect(sqlText(query)).toContain('gd."tradeName" ILIKE $1');
    expect(sqlText(query)).toContain('gd."scientificName" ILIKE $2');
    expect(sqlText(query)).toContain('gd."barcode" LIKE $3');
    expect(sqlText(query)).toContain('WHERE "stock" > 0 AND "stock" < "minStock"');
    expect(query.values.slice(0, 3)).toEqual([
      "%amox%' OR 1=1 --%",
      "%amox%' OR 1=1 --%",
      "%amox%' OR 1=1 --%",
    ]);
  });

  it("bounds page size at 50 ids and normalizes invalid pages to page one", () => {
    const query = buildInventoryPageIdsQuery({
      page: -4,
      query: "",
      status: "surplus",
      tenantBranchWhere: {},
      pageSize: 500,
    });

    expect(sqlText(query)).toContain("LIMIT $1");
    expect(sqlText(query)).toContain("OFFSET $2");
    expect(query.values).toEqual([50, 0]);
  });
});
