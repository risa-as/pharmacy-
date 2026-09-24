import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
const state=vi.hoisted(()=>({db:null as any,session:null as any}));
vi.mock('@/app/lib/prisma',()=>({get prisma(){return state.db;}}));
vi.mock('@/auth',()=>({auth:async()=>state.session}));
import {validateSyncUser} from '../app/lib/sync-auth';
import {generateSyncToken} from '../app/lib/sync-token';
import {deviceRequestMessage,normalizeDevicePublicKey} from '../app/lib/device-signature';
import {POST as adminAction} from '../app/api/admin/device-signing/route';
import {POST as enrol} from '../app/api/device-signing/route';
const db=new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});state.db=db;
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const material=normalizeDevicePublicKey(pair.publicKey.export({type:'spki',format:'pem'}).toString());
let branch:any,user:any,license:any,key:any,org:any;
beforeAll(async()=>{
 org=await db.organization.create({data:{name:'TPM isolated '+randomUUID()}});
 branch=await db.branch.create({data:{name:'TPM test',organizationId:org.id}});
 user=await db.user.create({data:{email:randomUUID()+'@test.invalid',password:'unused',role:'PHARMACIST',branchId:branch.id}});
 license=await db.deviceLicense.create({data:{branchId:branch.id,licenseKey:randomUUID()}});
 key=await db.deviceSigningKey.create({data:{licenseId:license.id,...material,status:'ACTIVE'}});
});
afterAll(async()=>{vi.unstubAllEnvs();await db.$disconnect();});
beforeEach(async()=>{vi.stubEnv('SYNC_TOKEN_SECRET','isolated-tpm-test-only');vi.stubEnv('TPM_DEVICE_AUTH_ENABLED','true');vi.stubEnv('REQUIRE_TPM_SYNC','false');state.session=null;await db.deviceSigningKey.update({where:{id:key.id},data:{status:'ACTIVE'}});});
function request(options:{unsigned?:boolean;body?:string;omitLicense?:boolean;token?:string}={}){
 const token=options.token||generateSyncToken(user.id,branch.id,org.id,user.role,0,{keyId:key.id,fingerprint:key.fingerprint});
 const time=String(Date.now()),nonce=randomUUID(),url='http://test.invalid/api/sync/sales',body='{"sales":[]}';
 const signature=sign('sha256',Buffer.from(deviceRequestMessage('POST',url,body,time,nonce,token,license.licenseKey,'',key.id)),pair.privateKey).toString('base64');
 return new Request(url,{method:'POST',body:options.body||body,headers:{'x-sync-token':token,'x-user-id':user.id,'x-user-role':user.role,'x-org-id':org.id,'x-branch-id':branch.id,...(!options.omitLicense?{'x-device-license-key':license.licenseKey}:{}),...(!options.unsigned?{'x-device-time':time,'x-device-nonce':nonce,'x-device-signature':signature,'x-device-fingerprint':key.fingerprint,'x-device-key-id':key.id}:{})}});
}
it('accepts signed bound desktop sessions',async()=>expect(await validateSyncUser(request())).toMatchObject({id:user.id}));
it('rejects cloned license/token without the private key',async()=>expect((await validateSyncUser(request({unsigned:true})) as Response).status).toBe(403));
it('cannot strip the license header from a bound session',async()=>expect((await validateSyncUser(request({omitLicense:true})) as Response).status).toBe(403));
it('rejects changed payload',async()=>expect((await validateSyncUser(request({body:'{"sales":[1]}'})) as Response).status).toBe(403));
it('atomically rejects simultaneous replay',async()=>{
 const r=request();const results=await Promise.all([validateSyncUser(r),validateSyncUser(r.clone())]);
 expect(results.filter(x=>!(x instanceof Response))).toHaveLength(1);
 expect(results.filter(x=>x instanceof Response).map(x=>(x as Response).status)).toEqual([409]);
});
it('revokes the key immediately',async()=>{await db.deviceSigningKey.update({where:{id:key.id},data:{status:'REVOKED'}});expect((await validateSyncUser(request()) as Response).status).toBe(403);});
it('key-only requests from a previous registration cannot revive after reset with the same public key',async()=>{
 const l=await db.deviceLicense.create({data:{branchId:branch.id,licenseKey:randomUUID()}});
 const old=await db.deviceSigningKey.create({data:{licenseId:l.id,...material,status:'ACTIVE'}});
 const url='http://test.invalid/api/sync/patients',time=String(Date.now()),nonce=randomUUID();
 const signature=sign('sha256',Buffer.from(deviceRequestMessage('GET',url,'',time,nonce,'',l.licenseKey,'',old.id)),pair.privateKey).toString('base64');
 const make=()=>new Request(url,{headers:{'x-branch-id':branch.id,'x-device-license-key':l.licenseKey,'x-device-time':time,'x-device-nonce':nonce,'x-device-signature':signature,'x-device-fingerprint':material.fingerprint,'x-device-key-id':old.id}});
 expect(await validateSyncUser(make())).toMatchObject({role:'DEVICE'});
 await db.deviceSigningKey.delete({where:{id:old.id}});
 await db.deviceSigningKey.create({data:{licenseId:l.id,...material,status:'ACTIVE'}});
 expect((await validateSyncUser(make()) as Response).status).toBe(403);
});
it('fails closed if the signing feature is disabled for an already bound token',async()=>{vi.stubEnv('TPM_DEVICE_AUTH_ENABLED','false');expect((await validateSyncUser(request()) as Response).status).toBe(503);});
it('strict rollout refuses unsigned legacy desktop tokens even without a license header',async()=>{
 vi.stubEnv('REQUIRE_TPM_SYNC','true');const token=generateSyncToken(user.id,branch.id,org.id,user.role,0);
 expect((await validateSyncUser(request({token,omitLicense:true,unsigned:true})) as Response).status).toBe(403);
});
it('does not apply desktop enforcement to web sessions',async()=>{
 vi.stubEnv('REQUIRE_TPM_SYNC','true');state.session={user:{id:user.id}};
 expect(await validateSyncUser(new Request('http://test.invalid/api/sync/sales'))).toMatchObject({id:user.id});
});
it('ordinary employees cannot approve a key',async()=>{state.session={user:{id:user.id,role:'PHARMACIST'}};expect((await adminAction(new Request('http://test.invalid',{method:'POST',body:'{}'}))).status).toBe(403);});
it('strict rollout permits proof-of-possession enrollment without permitting business writes',async()=>{
 vi.stubEnv('REQUIRE_TPM_SYNC','true');
 const newLicense=await db.deviceLicense.create({data:{branchId:branch.id,licenseKey:randomUUID()}});
 const token=generateSyncToken(user.id,branch.id,org.id,user.role,0),body=JSON.stringify({publicKey:material.publicKey});
 const url='http://test.invalid/api/device-signing',time=String(Date.now()),nonce=randomUUID();
 const signature=sign('sha256',Buffer.from(deviceRequestMessage('POST',url,body,time,nonce,token,newLicense.licenseKey)),pair.privateKey).toString('base64');
 const headers={'x-sync-token':token,'x-user-id':user.id,'x-user-role':user.role,'x-org-id':org.id,'x-branch-id':branch.id,'x-device-license-key':newLicense.licenseKey,'x-device-time':time,'x-device-nonce':nonce,'x-device-signature':signature,'x-device-fingerprint':material.fingerprint};
 const response=await enrol(new Request(url,{method:'POST',body,headers}));
 expect(response.status).toBe(200);expect((await response.json()).status).toBe('PENDING');
 expect((await validateSyncUser(new Request('http://test.invalid/api/sync/sales',{method:'POST',body,headers})) as Response).status).toBe(403);
});
it('admin approval and audit are atomic; stale repeated approval is rejected',async()=>{
 await db.deviceSigningKey.update({where:{id:key.id},data:{status:'PENDING'}});
 state.session={user:{id:user.id,role:'SUPER_ADMIN',name:'Test admin'}};
 const r=()=>new Request('http://test.invalid',{method:'POST',body:JSON.stringify({id:key.id,fingerprint:key.fingerprint,action:'approve'})});
 expect((await adminAction(r())).status).toBe(200);
 expect(await db.auditLog.count({where:{entityId:license.id,action:'DEVICE_KEY_APPROVE'}})).toBe(1);
 expect((await adminAction(r())).status).toBe(409);
});
