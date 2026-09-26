import { createHash, randomUUID } from 'node:crypto';
import { ipcMain, net } from 'electron';
import store from './store';
import { getApiBaseUrl, getApiCandidates } from './api-config';
import { tpmCommand, tpmPublicKey } from './tpm-worker';
import { deviceDisplayState } from './device-display-state';
import { readDeviceEnrollmentResponse } from './device-enrollment-response';

export function requestDigest(method: string, url: string, body: string, time: string, nonce: string, token: string, license: string, idempotencyKey = '', keyId = '') {
  const u = new URL(url); const hash = (v: string) => createHash('sha256').update(v).digest('hex');
  return createHash('sha256').update(JSON.stringify(['faramace-device-request:v1',method.toUpperCase(),u.pathname+u.search,time,nonce,hash(body),hash(token),hash(license),hash(idempotencyKey),keyId])).digest('base64');
}
/** Request signatures prove possession at transmission, not who created the sale. */
export async function deviceFetch(input: string | URL | Request, init: RequestInit = {}, enrollmentIdentity?: {fingerprint:string;keyId:string}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const state = enrollmentIdentity || store.get('deviceSigning') as {fingerprint?:string;keyId?:string} | undefined;
  const headers = new Headers(init.headers);
  const licensedRequest = headers.has('x-sync-token') || headers.has('x-device-license-key');
  if (!state?.fingerprint || !licensedRequest || !getApiCandidates().some(base => url.startsWith(base.replace(/\/$/,'')+'/')))
    return net.fetch(input instanceof URL ? input.href : input,init);
  if (input instanceof Request || (init.body != null && typeof init.body !== 'string')) throw Error('Unsupported signed request body');
  const license = String(store.get('licenseKey') || '');
  if (!headers.has('x-device-license-key')) headers.set('x-device-license-key',license);
  const time = String(Date.now()), nonce = randomUUID();
  const digest = requestDigest(init.method || 'GET',url,(init.body as string)||'',time,nonce,headers.get('x-sync-token')||'',headers.get('x-device-license-key')||'',headers.get('x-idempotency-key')||'',state.keyId||'');
  let signature: string;
  try { signature = await tpmCommand('sign',digest); }
  catch(e) { store.set('deviceSigningError','مفتاح الجهاز غير متاح؛ المزامنة معلقة والعمليات محفوظة.'); throw e; }
  headers.set('x-device-key-id',state.keyId||'');
  headers.set('x-device-time',time); headers.set('x-device-nonce',nonce);
  headers.set('x-device-fingerprint',state.fingerprint); headers.set('x-device-signature',signature);
  const response = await net.fetch(input instanceof URL ? input.href : input,{...init,headers});
  if (!response.ok) {
    const data = await response.clone().json().catch(()=>null);
    if (data?.code?.startsWith('DEVICE_')) {
      store.set('deviceSigningError',data.error);
      // Not a permanent per-sale rejection: leave the entire original queue
      // intact for retry after device recovery, never mark it synchronized.
      throw new Error(data.error || 'تعذر إثبات الجهاز؛ العمليات محفوظة.');
    }
  } else { store.set('deviceSigningError',''); }
  return response;
}

export function registerDeviceSigning() {
  ipcMain.handle('device-signing:status', async () => {
    const configured = store.get('deviceSigningCandidate') || store.get('deviceSigning') || null;
    return {configured,platform:process.platform,server:new URL(getApiBaseUrl()).origin,...deviceDisplayState(configured as any,store.get('syncToken'),store.get('loggedInUserId'),store.get('syncUserId'),store.get('deviceSigningError')),error:store.get('deviceSigningError')||''};
  });
  ipcMain.handle('device-signing:enrol', async () => {
    try {
      if (!store.get('loggedInUserId') || store.get('loggedInUserId') !== store.get('syncUserId')) throw Error('سجّل الدخول عبر الإنترنت بالحساب الحالي أولًا.');
      if (!store.get('licenseKey')) throw Error('فعّل ترخيص الجهاز أولًا.');
      const previous = store.get('deviceSigning') as any;
      // Refresh must never recreate an enrolled key if Windows cannot find it.
      // A candidate is used to sign this request only; failed enrollment must
      // not erase the last confirmed key id or replace its fingerprint.
      const key = await tpmPublicKey(!previous?.fingerprint);
      const candidate = {fingerprint:key.fingerprint,keyId:previous?.fingerprint === key.fingerprint ? previous.keyId || '' : ''};
      store.set('deviceSigningCandidate',previous?.fingerprint !== key.fingerprint ? candidate : null);
      const response = await deviceFetch(`${getApiBaseUrl()}/device-signing`,{method:'POST',headers:{
        'content-type':'application/json','x-device-license-key':String(store.get('licenseKey')),
        'x-sync-token':String(store.get('syncToken')||''),'x-user-id':String(store.get('syncUserId')||''),
        'x-branch-id':String(store.get('branchId')||''),'x-org-id':String(store.get('syncOrgId')||''),'x-user-role':String(store.get('syncUserRole')||''),
      },body:JSON.stringify({publicKey:key.pem}),signal:AbortSignal.timeout(15000)},candidate);
      const data = await readDeviceEnrollmentResponse(response, getApiBaseUrl(), key.fingerprint);
      store.set('deviceSigning',{fingerprint:key.fingerprint,keyId:data.keyId,status:data.status});
      store.set('deviceSigningCandidate',null);
      store.set('deviceSigningError','');
      return {success:true,...data};
    } catch (e) {
      const error=e instanceof Error?e.message:'تعذر إعداد حماية الجهاز.';
      store.set('deviceSigningError',error);
      return {success:false,error};
    }
  });
}
