import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/app/lib/prisma';
import { deviceSigningEnabled } from '@/app/lib/device-signature';
export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== 'SUPER_ADMIN') return NextResponse.json({error:'غير مصرح'},{status:403});
  if (!deviceSigningEnabled()) return NextResponse.json({enabled:false,keys:[]});
  return NextResponse.json({enabled:true,keys:await prisma.deviceSigningKey.findMany({select:{id:true,fingerprint:true,status:true,createdAt:true,license:{select:{deviceName:true,branch:{select:{name:true,organization:{select:{name:true}}}}}}},orderBy:{createdAt:'desc'}})});
}
export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.role !== 'SUPER_ADMIN') return NextResponse.json({error:'غير مصرح'},{status:403});
  if (!deviceSigningEnabled()) return NextResponse.json({error:'الميزة غير مفعلة'},{status:409});
  const {id,fingerprint,action} = await request.json();
  if (!['approve','revoke','reset'].includes(action) || typeof id !== 'string' || typeof fingerprint !== 'string') return NextResponse.json({error:'طلب غير صالح'},{status:400});
  try {
    await prisma.$transaction(async tx => {
      const key = await tx.deviceSigningKey.findUniqueOrThrow({where:{id}});
      if (key.fingerprint !== fingerprint) throw Error('changed');
      if (action === 'approve' && key.status !== 'PENDING') throw Error('not pending');
      if (action === 'reset' && key.status !== 'REVOKED') throw Error('revoke first');
      if (action === 'reset') await tx.deviceSigningKey.delete({where:{id}});
      else {
        const updated = await tx.deviceSigningKey.updateMany({where:{id,status:key.status},data:{status:action==='approve'?'ACTIVE':'REVOKED',approvedBy:session.user!.id,approvedAt:new Date()}});
        if (updated.count !== 1) throw Error('changed');
      }
      await tx.auditLog.create({data:{userId:session.user!.id!,userName:session.user!.name || 'SUPER_ADMIN',action:'DEVICE_KEY_'+action.toUpperCase(),entity:'DEVICE_LICENSE',entityId:key.licenseId,details:JSON.stringify({fingerprint,before:key.status})}});
    });
    return NextResponse.json({success:true});
  } catch { return NextResponse.json({error:'تغيرت حالة المفتاح؛ حدّث الصفحة.'},{status:409}); }
}
