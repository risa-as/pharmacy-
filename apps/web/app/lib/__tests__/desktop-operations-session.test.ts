import {beforeEach,expect,it,vi} from 'vitest';
import {NextResponse} from 'next/server';
const h=vi.hoisted(()=>({validate:vi.fn(),user:vi.fn(),feature:vi.fn(),branches:vi.fn()}));
vi.mock('@/app/lib/sync-auth',()=>({validateSyncUser:h.validate}));
vi.mock('@/app/lib/prisma',()=>({prisma:{user:{findUnique:h.user},branch:{count:h.branches}}}));
vi.mock('@/app/lib/saas-guards',()=>({checkFeatureAccess:h.feature}));
import {POST} from '../../api/desktop/operations/session/route';
import {jwtVerify} from 'jose';
const user={id:'u',isActive:true,role:'PHARMACIST',branchId:'b',permissions:null,branch:{id:'b',name:'Branch',organizationId:'org'}};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('AUTH_SECRET','test-desktop-operations-secret-only');h.validate.mockResolvedValue({id:'u',role:'PHARMACIST',branchId:'b',organizationId:'org'});h.user.mockResolvedValue(user);h.feature.mockResolvedValue({allowed:true});h.branches.mockResolvedValue(1);});
const request=()=>new Request('http://local/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'signed'}});
it('rejects license-only authentication',async()=>{expect((await POST(new Request('http://local/x',{method:'POST',headers:{'x-device-license-key':'license'}}))).status).toBe(401);expect(h.validate).not.toHaveBeenCalled();});
it('rejects invalid signed identity',async()=>{h.validate.mockResolvedValue(NextResponse.json({error:'bad'},{status:401}));expect((await POST(request())).status).toBe(401);});
it.each([{isActive:false},{branchId:'foreign'},{role:'ADMIN'},{branch:{organizationId:'foreign'}}])('rejects changed identity %j',async patch=>{h.user.mockResolvedValue({...user,...patch});expect((await POST(request())).status).toBe(403);});
it('issues short-lived token for current database identity with no password',async()=>{const res=await POST(request());expect(res.status).toBe(200);const data=await res.json();const {payload}=await jwtVerify(data.token,new TextEncoder().encode(process.env.AUTH_SECRET));expect(payload.userId).toBe('u');expect(payload.branchId).toBe('b');expect(payload.exp!-payload.iat!).toBe(300);expect(data.password).toBeUndefined();expect(data.branchName).toBe('Branch');});

it.each([1,3])('returns the organization branch count (%s), not the employees scoped branch count',async count=>{h.branches.mockResolvedValue(count);const data=await (await POST(request())).json();expect(data.branchCount).toBe(count);expect(h.branches).toHaveBeenCalledWith({where:{organizationId:'org'}});});
