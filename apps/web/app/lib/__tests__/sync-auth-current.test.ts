import { afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
const h=vi.hoisted(()=>({user:vi.fn().mockResolvedValue({isActive:false,sessionVersion:0}),org:vi.fn().mockResolvedValue({isSuspended:false,subscriptionEndsAt:new Date('2035-01-01')})}));
vi.mock('@/auth',()=>({auth:vi.fn()}));
vi.mock('@/app/lib/prisma',()=>({prisma:{user:{findUnique:h.user},organization:{findUnique:h.org}}}));
import { validateSyncUser } from '../sync-auth';
afterEach(()=>vi.unstubAllEnvs());
it('rejects a previous sync token when the account is disabled',async()=>{
  vi.stubEnv('SYNC_TOKEN_SECRET','audit-only-synthetic-secret');
  const token=createHmac('sha256','audit-only-synthetic-secret').update('employee-a:branch-a:org-a:PHARMACIST').digest('hex');
  const result=await validateSyncUser(new Request('http://audit.invalid',{headers:{'x-sync-token':token,'x-user-id':'employee-a','x-branch-id':'branch-a','x-org-id':'org-a','x-user-role':'PHARMACIST'}}));
  expect((result as Response).status).toBe(403);
  expect(h.user).toHaveBeenCalled();
});
it('accepts an active user only in the signed branch and role',async()=>{
  vi.stubEnv('SYNC_TOKEN_SECRET','audit-only-synthetic-secret');
  h.user.mockResolvedValue({id:'employee-a',isActive:true,role:'PHARMACIST',branchId:'branch-a',branch:{organizationId:'org-a'},email:'audit@test.invalid',sessionVersion:0});
  const token=createHmac('sha256','audit-only-synthetic-secret').update('employee-a:branch-a:org-a:PHARMACIST').digest('hex');
  const req=()=>new Request('http://audit.invalid',{headers:{'x-sync-token':token,'x-user-id':'employee-a','x-branch-id':'branch-a','x-org-id':'org-a','x-user-role':'PHARMACIST'}});
  expect(await validateSyncUser(req())).toMatchObject({id:'employee-a',branchId:'branch-a'});
  h.user.mockResolvedValue({id:'employee-a',isActive:true,role:'PHARMACIST',branchId:'branch-b',branch:{organizationId:'org-a'},sessionVersion:0});
  expect((await validateSyncUser(req()) as Response).status).toBe(401);
});

it('answers 503 (retryable) when the database is unreachable, 401 for other failures',async()=>{
  vi.stubEnv('SYNC_TOKEN_SECRET','audit-only-synthetic-secret');
  const token=createHmac('sha256','audit-only-synthetic-secret').update('employee-a:branch-a:org-a:PHARMACIST').digest('hex');
  const req=()=>new Request('http://audit.invalid',{headers:{'x-sync-token':token,'x-user-id':'employee-a','x-branch-id':'branch-a','x-org-id':'org-a','x-user-role':'PHARMACIST'}});
  h.user.mockRejectedValueOnce(Object.assign(new Error("Can't reach database server"),{name:'PrismaClientInitializationError'}));
  expect((await validateSyncUser(req()) as Response).status).toBe(503);
  h.user.mockRejectedValueOnce(new Error('unexpected'));
  expect((await validateSyncUser(req()) as Response).status).toBe(401);
});
