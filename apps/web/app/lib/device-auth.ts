import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { deviceSigningEnabled, diagnoseDeviceRequest } from './device-signature';

/** Server-side reason for a refused device proof. No signature, key, fingerprint,
 * license or token is logged; the device only sees the generic rejection. */
function logDeviceRejection(request: Request, code: string, detail: Record<string, unknown>) {
  let path = '';
  try { path = new URL(request.url).pathname; } catch { /* keep empty */ }
  console.warn('[device-auth] rejected', JSON.stringify({code, path, ...detail}));
}

/** Only desktop credentials participate; mobile and web keep their own auth. */
export async function enforceDeviceSignature(request: Request, bound?: {keyId: string; fingerprint: string}): Promise<NextResponse | null> {
  if (!deviceSigningEnabled()) {
    if (!bound && process.env.REQUIRE_TPM_SYNC !== 'true') return null;
    logDeviceRejection(request, 'DEVICE_SIGNING_UNAVAILABLE', {reason: 'server-signing-disabled', bound: !!bound});
    return NextResponse.json({error:'Device signing unavailable'}, {status:503});
  }
  const licenseKey = request.headers.get('x-device-license-key');
  const required = process.env.REQUIRE_TPM_SYNC === 'true';
  if (!licenseKey && !bound) {
    if (!required) return null;
    logDeviceRejection(request, 'DEVICE_SIGNATURE_REQUIRED', {reason: 'no-license-header'});
    return NextResponse.json({error:'يلزم اعتماد الجهاز وتسجيل الدخول مجددًا.',code:'DEVICE_SIGNATURE_REQUIRED'}, {status:403});
  }
  const key = await prisma.deviceSigningKey.findFirst({where: bound ? {id:bound.keyId} : {license:{licenseKey:licenseKey!}} ,include:{license:true}});
  if (!key) {
    if (!bound && !required) return null;
    // Bound: the session names a key that no longer exists. Otherwise: no key is
    // registered for this license while signing is required.
    logDeviceRejection(request, 'DEVICE_SIGNATURE_REQUIRED', {reason: bound ? 'bound-key-missing' : 'no-key-for-license'});
    return NextResponse.json({error:'الجهاز غير معتمد.',code:'DEVICE_SIGNATURE_REQUIRED'}, {status:403});
  }
  if (key.status === 'PENDING' && !bound && !required) return null;
  const revoked = key.status !== 'ACTIVE' ? 'key-status-' + String(key.status).toLowerCase()
    : !key.license.isActive ? 'license-inactive'
    : key.license.expiresAt && key.license.expiresAt < new Date() ? 'license-expired'
    : key.license.licenseKey !== licenseKey ? 'license-mismatch'
    : bound && bound.fingerprint !== key.fingerprint ? 'bound-fingerprint-mismatch' : null;
  if (revoked) {
    logDeviceRejection(request, 'DEVICE_KEY_REVOKED', {reason: revoked, keyId: key.id});
    return NextResponse.json({error:'اعتماد الجهاز غير صالح؛ راجع مدير المنصة.',code:'DEVICE_KEY_REVOKED'}, {status:403});
  }
  const verified = await diagnoseDeviceRequest(request, key);
  if (!('nonce' in verified)) {
    logDeviceRejection(request, 'DEVICE_SIGNATURE_INVALID', {reason: verified.reason, skewSeconds: verified.skewSeconds, keyId: key.id});
    return NextResponse.json({error:'تعذر إثبات الجهاز. تحقق من مفتاحه ووقت Windows ثم أعد المزامنة.',code:'DEVICE_SIGNATURE_INVALID'}, {status:403});
  }
  const nonce = verified.nonce;
  try {
    await prisma.deviceSigningNonce.create({data:{keyId:key.id,nonce,expiresAt:new Date(Date.now()+240000)}});
  } catch (e: any) {
    if (e.code === 'P2002') {
      logDeviceRejection(request, 'DEVICE_REPLAY', {keyId: key.id});
      return NextResponse.json({error:'توقيع الطلب مستخدم؛ أعد المحاولة بتوقيع جديد.',code:'DEVICE_REPLAY'}, {status:409});
    }
    throw e;
  }
  // Expiry is longer than the signature acceptance window; no live nonce is removed.
  await prisma.deviceSigningNonce.deleteMany({where:{expiresAt:{lt:new Date()}}});
  return null;
}
