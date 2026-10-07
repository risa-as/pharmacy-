export const dynamic='force-dynamic';
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/app/lib/tenant-utils';
/** Retire the arbitrary-number sender: all sends go through consent and the outbox. */
export async function POST() {
  const ctx=await getTenantContext('write');if(ctx instanceof NextResponse)return ctx;
  return NextResponse.json({error:'انتقل إلى حملات WhatsApp في صفحة المرضى؛ الإرسال المباشر القديم متوقف.'},{status:410});
}
export async function GET() {
  const ctx=await getTenantContext('read');if(ctx instanceof NextResponse)return ctx;
  return NextResponse.json({error:'القوالب والحملات متاحة عبر /api/whatsapp.'},{status:410});
}
