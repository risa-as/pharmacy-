import {beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
const h=vi.hoisted(()=>({data:{} as Record<string,any>,sign:vi.fn(),fetch:vi.fn()}));
vi.mock('../store',()=>({default:{get:(k:string)=>h.data[k],set:(k:string,v:any)=>{h.data[k]=v;}}}));
vi.mock('../tpm-worker',()=>({tpmCommand:h.sign,tpmPublicKey:vi.fn()}));
vi.mock('../api-config',()=>({getApiCandidates:()=>['https://app.test/api'],getApiBaseUrl:()=> 'https://app.test/api'}));
import {deviceFetch,requestDigest} from '../device-signing';
beforeEach(()=>{h.data={deviceSigning:{fingerprint:'fp'},licenseKey:'license'};h.sign.mockReset().mockResolvedValue('signature');h.fetch.mockReset().mockImplementation(()=>Promise.resolve(new Response('{}')));vi.stubGlobal('fetch',h.fetch);});
it('signs away from the renderer and binds the exact payload and credentials',async()=>{
 await deviceFetch('https://app.test/api/sync/sales',{method:'POST',body:'{}',headers:{'x-sync-token':'token'}});
 const [url,init]=h.fetch.mock.calls[0];const headers=init.headers as Headers;
 expect(h.sign).toHaveBeenCalledWith('sign',requestDigest('POST',url,'{}',headers.get('x-device-time')!,headers.get('x-device-nonce')!,'token','license'));
 expect(headers.get('x-device-signature')).toBe('signature');
});
it('does not send anything or discard pending operations when TPM fails',async()=>{
 h.data.pendingSyncActions=[{id:'old'}];h.sign.mockRejectedValue(new Error('unavailable'));
 await expect(deviceFetch('https://app.test/api/sync/sales',{headers:{'x-sync-token':'token'}})).rejects.toThrow();
 expect(h.fetch).not.toHaveBeenCalled();expect(h.data.pendingSyncActions).toEqual([{id:'old'}]);
});
it('never signs unrelated endpoints',async()=>{await deviceFetch('https://foreign.test/api/sync/sales',{headers:{'x-sync-token':'token'}});expect(h.sign).not.toHaveBeenCalled();});
it('keeps legacy devices working until explicitly enrolled',async()=>{delete h.data.deviceSigning;await deviceFetch('https://app.test/api/sync/sales',{headers:{'x-sync-token':'token'}});expect(h.sign).not.toHaveBeenCalled();});
it('returns device rejection as retryable error without changing the operation queue',async()=>{
 h.fetch.mockResolvedValue(new Response(JSON.stringify({code:'DEVICE_KEY_REVOKED',error:'revoked'}),{status:403}));
 await expect(deviceFetch('https://app.test/api/sync/sales',{headers:{'x-sync-token':'token'}})).rejects.toThrow('revoked');
});
it('matches the versioned server protocol',()=>{
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 expect(requestDigest('post','https://app.test/api/sync/sales?q=1','{}','123','nonce','t','l')).toBe(createHash('sha256').update(JSON.stringify(['faramace-device-request:v1','POST','/api/sync/sales?q=1','123','nonce',hash('{}'),hash('t'),hash('l'),hash(''),''])).digest('base64'));
});
