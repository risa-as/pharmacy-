import { beforeEach, expect, it, vi } from 'vitest';
const h=vi.hoisted(()=>({ctx:null as any,update:vi.fn()}));
vi.mock('@/app/lib/tenant-utils',()=>({getTenantContext:async()=>h.ctx}));
vi.mock('@/app/lib/prisma',()=>({prisma:{organization:{update:h.update}}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:()=>{throw new Error('redirect');}}));
import { updateOrganization } from '../actions/organization';
import { canAccessPath } from '../route-permissions';
import { getDefaultPermissions } from '../permissions';
beforeEach(()=>{vi.clearAllMocks();h.ctx={user:{role:'PHARMACIST',organizationId:'own'},userPermissions:getDefaultPermissions('PHARMACIST')};});
const form=()=>{const f=new FormData();f.set('name','New name');return f;};
it('blocks an employee from renaming even their own organization',async()=>{
 expect(await updateOrganization('own',{},form())).toHaveProperty('message');expect(h.update).not.toHaveBeenCalled();
 expect(canAccessPath('/dashboard/organizations/own/edit',h.ctx.userPermissions)).toBe(false);
});
it('blocks a settings manager from changing another organization',async()=>{
 h.ctx.userPermissions.canChangeSettings=true;
 await updateOrganization('foreign',{},form());expect(h.update).not.toHaveBeenCalled();
});
it('preserves authorized editing of the own organization',async()=>{
 h.ctx.user.role='ADMIN';h.ctx.userPermissions=getDefaultPermissions('ADMIN');
 await expect(updateOrganization('own',{},form())).rejects.toThrow('redirect');
 expect(h.update).toHaveBeenCalledWith({where:{id:'own'},data:{name:'New name'}});
});
