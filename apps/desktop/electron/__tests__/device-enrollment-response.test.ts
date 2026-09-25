import {expect, it} from 'vitest';
import {readDeviceEnrollmentResponse as read} from '../device-enrollment-response';
const base = 'https://app.test/api';
it.each([404,405])('explains unavailable HTML endpoint (%s)', async status => {
  await expect(read(new Response('<!DOCTYPE html>secret proxy body',{status}),base,'fp')).rejects.toThrow('خدمة تسجيل مفتاح الجهاز غير متاحة على https://app.test');
});
it.each([200,502])('rejects HTML rather than treating it as enrollment (%s)', async status => {
  await expect(read(new Response('<!DOCTYPE html>',{status}),base,'fp')).rejects.toThrow('استجابة غير متوقعة');
});
it('rejects login redirects', async()=>{
  const response=new Response('{}'); Object.defineProperty(response,'redirected',{value:true});
  await expect(read(response,base,'fp')).rejects.toThrow('تم تحويل');
});
it('preserves explicit disabled-feature error from server', async()=>{
  await expect(read(Response.json({error:'حماية الجهاز غير مفعلة على الخادم بعد.'},{status:404}),base,'fp')).rejects.toThrow('غير مفعلة');
});
it.each([{},null,{keyId:'id',status:'ACTIVE',fingerprint:'other'},{keyId:'',status:'ACTIVE',fingerprint:'fp'},{keyId:'id',status:'unknown',fingerprint:'fp'}])('rejects invalid success payload %j', async payload=>{
  await expect(read(Response.json(payload),base,'fp')).rejects.toThrow();
});
it.each(['PENDING','ACTIVE','REVOKED'])('accepts validated %s state', async status=>{
  const result={keyId:'id',status,fingerprint:'fp'};
  expect(await read(Response.json(result),base,'fp')).toEqual(result);
});
