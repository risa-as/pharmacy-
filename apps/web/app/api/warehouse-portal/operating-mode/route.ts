import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
export async function PATCH(req:NextRequest) {
 const ctx=await getWarehouseContext();if(ctx instanceof NextResponse)return ctx;
 const gate=await requireWarehousePermission(ctx,'canChangeSettings');if(!gate.ok)return gate.response;
 if(gate.actor.warehouseUserType!=='OWNER')return NextResponse.json({error:'اختيار طريقة التشغيل متاح لمالك المذخر فقط.'},{status:403});
 const body=await req.json().catch(()=>null);
 if(!body || !['FULL','ORDER_PORTAL'].includes(body.mode) || body.confirmed!==true)return NextResponse.json({error:'اختر الوضع وأكد فهم طريقة عمله.'},{status:400});
 const result=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Warehouse" WHERE id = ${ctx.warehouseId} FOR UPDATE`;
  const current=await tx.warehouse.findUniqueOrThrow({where:{id:ctx.warehouseId}});
  if(current.operatingMode===body.mode)return {ok:true};
  if(body.mode==='ORDER_PORTAL' && (await tx.warehouseBatch.count({where:{catalogItem:{warehouseId:ctx.warehouseId}}})>0 || await tx.warehousePurchase.count({where:{warehouseId:ctx.warehouseId}})>0))return {ok:false,error:'لديك دفعات أو مشتريات مسجلة. لا يمكن تحويلها إلى بوابة طلبات؛ أبقِ الإدارة الكاملة حفاظًا على السجل.'};
  // Opening inventory is entered after activation; shipping remains blocked until it is sufficient.
  await tx.warehouse.update({where:{id:ctx.warehouseId},data:{operatingMode:body.mode}});
  await tx.auditLog.create({data:{userId:ctx.user.id,userName:ctx.user.name ?? ctx.user.email ?? 'مالك المذخر',action:'UPDATE',entity:'WAREHOUSE_OPERATING_MODE',entityId:ctx.warehouseId,details:JSON.stringify({from:current.operatingMode,to:body.mode})}});
  return {ok:true};
 });
 return NextResponse.json(result,result.ok?undefined:{status:409});
}
