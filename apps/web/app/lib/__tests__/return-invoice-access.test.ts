import { expect, it, vi, beforeEach } from 'vitest';
const h=vi.hoisted(()=>({ctx:null as any,find:vi.fn(),settings:vi.fn()}));
vi.mock('@/app/lib/tenant-utils',()=>({getTenantContext:async()=>h.ctx}));
vi.mock('@/app/lib/prisma',()=>({prisma:{saleReturn:{findFirst:h.find},companySettings:{findFirst:h.settings}}}));
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('not-found');},redirect:()=>{throw new Error('redirect');}}));
import { getReturnInvoice } from '../return-invoice-data';
beforeEach(()=>{vi.clearAllMocks();h.ctx={tenantBranchWhere:{branchId:'own-branch'},userPermissions:{canViewReturns:true}};h.find.mockResolvedValue(null);});
it('scopes invoice lookup before accessing company details',async()=>{
 await expect(getReturnInvoice('foreign-return')).rejects.toThrow('not-found');
 expect(h.find).toHaveBeenCalledWith(expect.objectContaining({where:{AND:[{branchId:'own-branch'},{id:'foreign-return'}]}}));
 expect(h.settings).not.toHaveBeenCalled();
});
it('rejects a user without view-return permission before querying',async()=>{
 h.ctx.userPermissions.canViewReturns=false;
 await expect(getReturnInvoice('any')).rejects.toThrow('redirect');expect(h.find).not.toHaveBeenCalled();
});
