import {beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const h=vi.hoisted(()=>({data:{} as Record<string,any>,sign:vi.fn(),key:vi.fn(),fetch:vi.fn(),dir:'',getPath:null as any}));
vi.mock('electron',()=>({ipcMain:{handle:vi.fn()},net:{fetch:h.fetch},app:{getPath:(...a:any[])=>h.getPath(...a),getVersion:()=>'1.0.21'}}));
vi.mock('../store',()=>({default:{get:(k:string)=>h.data[k],set:(k:string,v:any)=>{h.data[k]=v;}}}));
vi.mock('../tpm-worker',()=>({tpmCommand:h.sign,tpmPublicKey:h.key}));
vi.mock('../api-config',()=>({getApiCandidates:()=>['https://app.test/api'],getApiBaseUrl:()=> 'https://app.test/api'}));
import {deviceFetch,requestDigest} from '../device-signing';
beforeEach(()=>{h.dir=mkdtempSync(path.join(tmpdir(),'device-signing-'));h.getPath=()=>h.dir;h.data={deviceSigning:{fingerprint:'fp'},licenseKey:'license'};h.sign.mockReset().mockResolvedValue('signature');h.key.mockReset().mockResolvedValue({fingerprint:'fp'});h.fetch.mockReset().mockImplementation(()=>Promise.resolve(new Response('{}')));vi.stubGlobal('fetch',h.fetch);});
it('uses the Electron network stack even when Node TLS transport fails',async()=>{
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE');}));
 await deviceFetch('https://app.test/api/health');
 await deviceFetch('https://app.test/api/sync/sales',{headers:{'x-sync-token':'token'}});
 expect(h.fetch).toHaveBeenCalledTimes(2);
});
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

const invalid = () => new Response(JSON.stringify({code:'DEVICE_SIGNATURE_INVALID',error:'invalid'}),{status:403});
it('re-signs a rejected session once after checking the existing public key',async()=>{
 h.fetch.mockResolvedValueOnce(invalid()).mockResolvedValueOnce(new Response('{}'));
 await deviceFetch('https://app.test/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'token'}});
 expect(h.fetch).toHaveBeenCalledTimes(2);expect(h.key).toHaveBeenCalledWith(false);
 const a=h.fetch.mock.calls[0][1].headers,b=h.fetch.mock.calls[1][1].headers;
 expect(a.get('x-device-nonce')).not.toBe(b.get('x-device-nonce'));
 expect(h.sign).toHaveBeenCalledTimes(2);expect(h.data.deviceSigningError).toBe('');
 expect(h.data.deviceSigning).toEqual({fingerprint:'fp'});
});
it('stops after a second rejection and preserves enrollment and pending work',async()=>{
 h.data.pendingSyncActions=[{id:'sale'}];h.fetch.mockImplementation(async()=>invalid());
 await expect(deviceFetch('https://app.test/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'token'}})).rejects.toThrow('invalid');
 expect(h.fetch).toHaveBeenCalledTimes(2);expect(h.data.pendingSyncActions).toEqual([{id:'sale'}]);expect(h.data.deviceSigning.fingerprint).toBe('fp');
});
it('does not retry if the real key differs, and never creates a replacement',async()=>{
 h.key.mockResolvedValue({fingerprint:'other'});h.fetch.mockResolvedValue(invalid());
 await expect(deviceFetch('https://app.test/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'token'}})).rejects.toThrow('invalid');
 expect(h.fetch).toHaveBeenCalledOnce();expect(h.key).toHaveBeenCalledWith(false);expect(h.data.deviceSigning.fingerprint).toBe('fp');
});
it.each(['DEVICE_KEY_REVOKED','DEVICE_REPLAY','DEVICE_KEY_UNKNOWN'])('does not retry session rejection %s',async(code)=>{
 h.fetch.mockResolvedValue(new Response(JSON.stringify({code,error:'denied'}),{status:403}));
 await expect(deviceFetch('https://app.test/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'token'}})).rejects.toThrow('denied');
 expect(h.fetch).toHaveBeenCalledOnce();expect(h.key).not.toHaveBeenCalled();
});
it('never retries rejected business writes or a lost session response',async()=>{
 h.fetch.mockResolvedValue(invalid());
 await expect(deviceFetch('https://app.test/api/sync/sales',{method:'POST',headers:{'x-sync-token':'token'},body:'{}'})).rejects.toThrow('invalid');
 expect(h.fetch).toHaveBeenCalledOnce();
 h.fetch.mockReset().mockRejectedValue(Error('lost response'));
 await expect(deviceFetch('https://app.test/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'token'}})).rejects.toThrow('lost response');
 expect(h.fetch).toHaveBeenCalledOnce();
});

const authLog=()=>{const f=path.join(h.dir,'device-auth.log');return existsSync(f)?readFileSync(f,'utf8').trim().split(/\r?\n/).map(l=>JSON.parse(l)):[];};
it('records a rejected-then-recovered session durably, with the key check and clock skew, and no secrets',async()=>{
 h.data={deviceSigning:{fingerprint:'FP-SECRET-000',keyId:'KEY-SECRET-111'},licenseKey:'LIC-SECRET-123'};h.key.mockResolvedValue({fingerprint:'FP-SECRET-000'});
 h.sign.mockResolvedValue('SIG-SECRET-789');
 const dated=new Response(JSON.stringify({code:'DEVICE_SIGNATURE_INVALID',error:'invalid'}),{status:403,headers:{date:new Date(Date.now()-5000).toUTCString()}});
 h.fetch.mockResolvedValueOnce(dated).mockResolvedValueOnce(new Response('{}'));
 await deviceFetch('https://app.test/api/desktop/operations/session?secret=QUERY-SECRET',{method:'POST',headers:{'x-sync-token':'TOKEN-SECRET-456'},body:'BODY-SECRET'});
 const events=authLog();
 expect(events.map((e:any)=>[e.attempt,e.outcome,e.code])).toEqual([[1,'retrying','DEVICE_SIGNATURE_INVALID'],[2,'recovered','OK']]);
 expect(events[0]).toMatchObject({path:'/api/desktop/operations/session',status:403,localKeyMatchesEnrollment:true,build:expect.stringMatching(/^1\.0\.21\+/)});
 expect(events[0].clockSkewSeconds).toBeGreaterThanOrEqual(4);
 const raw=readFileSync(path.join(h.dir,'device-auth.log'),'utf8');
 for(const secret of ['FP-SECRET','KEY-SECRET','LIC-SECRET','SIG-SECRET','TOKEN-SECRET','QUERY-SECRET','BODY-SECRET'])expect(raw).not.toContain(secret);
});
it('records a final rejection when the real key differs, and a TPM signing failure',async()=>{
 h.key.mockResolvedValue({fingerprint:'other'});h.fetch.mockResolvedValue(invalid());
 await expect(deviceFetch('https://app.test/api/sync/sales',{method:'POST',headers:{'x-sync-token':'token'},body:'{}'})).rejects.toThrow('invalid');
 h.sign.mockRejectedValue(new Error('unavailable'));
 await expect(deviceFetch('https://app.test/api/sync/sales',{headers:{'x-sync-token':'token'}})).rejects.toThrow('unavailable');
 expect(authLog().map((e:any)=>[e.code,e.outcome,e.localKeyMatchesEnrollment])).toEqual([['DEVICE_SIGNATURE_INVALID','rejected',false],['TPM_SIGN_FAILED','rejected',null]]);
});
it('keeps signing and syncing when the diagnostic log cannot be written',async()=>{
 h.getPath=()=>{throw Error('userData unavailable');};h.fetch.mockResolvedValueOnce(invalid()).mockResolvedValueOnce(new Response('{}'));
 const response=await deviceFetch('https://app.test/api/desktop/operations/session',{method:'POST',headers:{'x-sync-token':'token'}});
 expect(response.ok).toBe(true);expect(h.fetch).toHaveBeenCalledTimes(2);
});
