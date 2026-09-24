import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { validateDeviceEnrollmentUser } from '@/app/lib/sync-auth';
import { deviceSigningEnabled, normalizeDevicePublicKey, verifyDeviceRequest } from '@/app/lib/device-signature';
import { requestDeviceId } from '@/app/lib/operator-proof';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!deviceSigningEnabled()) return NextResponse.json({error:'حماية الجهاز غير مفعلة على الخادم بعد.'},{status:404});
  const user = await validateDeviceEnrollmentUser(request);
  if (user instanceof NextResponse) return user;
  if (!user.branchId || user.role === 'DEVICE') return NextResponse.json({error:'سجل الدخول بحساب موظف أولًا.'},{status:403});
  const licenseId = await requestDeviceId(prisma, request, user.branchId);
  if (!licenseId) return NextResponse.json({error:'ترخيص الجهاز غير صالح.'},{status:403});
  try {
    const signatureRequest = request.clone();
    const input = await request.json();
    const key = normalizeDevicePublicKey(input.publicKey);
    if (!await verifyDeviceRequest(signatureRequest,key)) return NextResponse.json({error:'لم يثبت الجهاز حيازته للمفتاح.'},{status:403});
    const existing = await prisma.$transaction(async tx => {
      const registered = await tx.deviceSigningKey.upsert({where:{licenseId},create:{licenseId,...key},update:{}});
      if (registered.fingerprint === key.fingerprint) await tx.auditLog.create({data:{
        userId:user.id,userName:user.name || user.email || user.id,action:'DEVICE_KEY_REQUESTED',
        entity:'DEVICE_LICENSE',entityId:licenseId,details:JSON.stringify({fingerprint:key.fingerprint,status:registered.status}),
      }});
      return registered;
    });
    if (existing.fingerprint !== key.fingerprint) return NextResponse.json({error:'يوجد مفتاح آخر لهذا الترخيص؛ اطلب إعادة تسجيل الجهاز من مدير المنصة.'},{status:409});
    return NextResponse.json({keyId:existing.id,status:existing.status,fingerprint:existing.fingerprint});
  } catch { return NextResponse.json({error:'تعذر تسجيل المفتاح. أعد المحاولة دون تغيير الترخيص.'},{status:400}); }
}
