import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { deviceSigningEnabled, verifyDeviceRequest } from './device-signature';

/** Only desktop credentials participate; mobile and web keep their own auth. */
export async function enforceDeviceSignature(request: Request, bound?: {keyId: string; fingerprint: string}): Promise<NextResponse | null> {
  if (!deviceSigningEnabled()) return bound || process.env.REQUIRE_TPM_SYNC === 'true' ? NextResponse.json({error:'Device signing unavailable'}, {status:503}) : null;
  const licenseKey = request.headers.get('x-device-license-key');
  const required = process.env.REQUIRE_TPM_SYNC === 'true';
  if (!licenseKey && !bound) return required ? NextResponse.json({error:'يلزم اعتماد الجهاز وتسجيل الدخول مجددًا.',code:'DEVICE_SIGNATURE_REQUIRED'}, {status:403}) : null;
  const key = await prisma.deviceSigningKey.findFirst({where: bound ? {id:bound.keyId} : {license:{licenseKey:licenseKey!}} ,include:{license:true}});
  if (!key) return bound || required ? NextResponse.json({error:'الجهاز غير معتمد.',code:'DEVICE_SIGNATURE_REQUIRED'}, {status:403}) : null;
  if (key.status === 'PENDING' && !bound && !required) return null;
  if (key.status !== 'ACTIVE' || !key.license.isActive || (key.license.expiresAt && key.license.expiresAt < new Date())
    || key.license.licenseKey !== licenseKey || (bound && bound.fingerprint !== key.fingerprint))
    return NextResponse.json({error:'اعتماد الجهاز غير صالح؛ راجع مدير المنصة.',code:'DEVICE_KEY_REVOKED'}, {status:403});
  const nonce = await verifyDeviceRequest(request, key);
  if (!nonce) return NextResponse.json({error:'تعذر إثبات الجهاز. تحقق من مفتاحه ووقت Windows ثم أعد المزامنة.',code:'DEVICE_SIGNATURE_INVALID'}, {status:403});
  try {
    await prisma.deviceSigningNonce.create({data:{keyId:key.id,nonce,expiresAt:new Date(Date.now()+240000)}});
  } catch (e: any) {
    if (e.code === 'P2002') return NextResponse.json({error:'توقيع الطلب مستخدم؛ أعد المحاولة بتوقيع جديد.',code:'DEVICE_REPLAY'}, {status:409});
    throw e;
  }
  // Expiry is longer than the signature acceptance window; no live nonce is removed.
  await prisma.deviceSigningNonce.deleteMany({where:{expiresAt:{lt:new Date()}}});
  return null;
}
