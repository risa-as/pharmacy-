import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const h = vi.hoisted(() => ({ ctx: vi.fn(), db: { branch: { findFirst: vi.fn() }, batch: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/app/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/app/lib/tenant-utils", () => ({ getTenantContext: h.ctx }));
import { GET } from "../../api/inventory/operation-batches/route";
beforeEach(() => {
 vi.clearAllMocks(); h.ctx.mockResolvedValue({user:{branchId:"own"},branchModelWhere:{organizationId:"org"},userPermissions:{canDoStocktake:true}});
 h.db.branch.findFirst.mockResolvedValue({id:"own"});h.db.batch.findMany.mockResolvedValue([]);h.db.batch.count.mockResolvedValue(0);
});
it("camera lookup uses exact barcode and the authorized branch, preserving leading zeroes",async()=>{
 const result = await GET(new Request("http://local/x?branchId=own&search=0123456789012&match=barcode"));
 expect(result.status).toBe(200);
 expect(h.db.batch.findMany.mock.calls[0][0].where).toEqual({inventory:{branchId:"own",drug:{barcode:"0123456789012"}}});
 expect(h.db.batch.count.mock.calls[0][0].where).toEqual(h.db.batch.findMany.mock.calls[0][0].where);
});
it("manual search retains partial name and barcode matching",async()=>{
 await GET(new Request("http://local/x?search=Brufen"));
 expect(h.db.batch.findMany.mock.calls[0][0].where.inventory.drug.OR).toEqual([{tradeName:{contains:"Brufen",mode:"insensitive"}},{barcode:{contains:"Brufen"}}]);
});
it("a scanned barcode cannot expose another branch's batches",async()=>{
 h.db.branch.findFirst.mockResolvedValue(null);
 expect((await GET(new Request("http://local/x?branchId=foreign&match=barcode&search=123"))).status).toBe(403);
 expect(h.db.batch.findMany).not.toHaveBeenCalled();
 expect(h.db.branch.findFirst.mock.calls[0][0].where).toEqual({AND:[{organizationId:"org"},{id:"foreign"}]});
});
it("denies lookup without stocktake or transfer permission",async()=>{
 h.ctx.mockResolvedValue({userPermissions:{}});
 expect((await GET(new Request("http://local/x?match=barcode&search=123"))).status).toBe(403);
 expect(h.db.batch.findMany).not.toHaveBeenCalled();
});
it("requires a session",async()=>{
 h.ctx.mockResolvedValue(NextResponse.json({error:"unauthorized"},{status:401}));
 expect((await GET(new Request("http://local/x?match=barcode&search=123"))).status).toBe(401);
});
