import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {deviceRequestMessage,normalizeDevicePublicKey,verifyDeviceRequest} from '../device-signature';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const key=normalizeDevicePublicKey(pair.publicKey.export({type:'spki',format:'pem'}).toString());
function request(change:Record<string,string>={}) {
  const time=String(Date.now()),nonce=randomUUID(),body='{"amount":10}',url='https://app.test/api/sync/sales';
  const signature=sign('sha256',Buffer.from(deviceRequestMessage('POST',url,body,time,nonce,'token','license')),pair.privateKey).toString('base64');
  return new Request(change.url||url,{method:change.method||'POST',body:change.body||body,headers:{'x-device-time':time,'x-device-nonce':nonce,'x-sync-token':'token','x-device-license-key':'license','x-device-fingerprint':key.fingerprint,'x-device-signature':signature,...change}});
}
describe('device request signatures',()=>{
 it('accepts possession proof over the exact request',async()=>expect(await verifyDeviceRequest(request(),key)).toBeTruthy());
 for(const [name,change] of Object.entries({body:{body:'{"amount":100}'},path:{url:'https://app.test/api/sync/debt-payments'},method:{method:'PUT'},token:{'x-sync-token':'other'},license:{'x-device-license-key':'other'},nonce:{'x-device-nonce':randomUUID()},idempotency:{'x-idempotency-key':'different'},time:{'x-device-time':String(Date.now()-300000)},fingerprint:{'x-device-fingerprint':'0'.repeat(64)}}))
   it('rejects altered '+name,async()=>expect(await verifyDeviceRequest(request(change),key)).toBeNull());
 it('rejects another private key',async()=>{const other=generateKeyPairSync('rsa',{modulusLength:2048});expect(await verifyDeviceRequest(request(),{...key,publicKey:other.publicKey.export({type:'spki',format:'pem'}).toString()})).toBeNull();});
 it('rejects weak keys',()=>{const weak=generateKeyPairSync('rsa',{modulusLength:1024});expect(()=>normalizeDevicePublicKey(weak.publicKey.export({type:'spki',format:'pem'}).toString())).toThrow();});
});
