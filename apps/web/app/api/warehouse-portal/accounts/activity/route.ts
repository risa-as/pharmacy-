import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission, hasWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { warehousePage } from '@/app/lib/warehouse-pagination';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const ctx=await getWarehouseContext();if(ctx instanceof NextResponse)return ctx;
 const gate=await requireWarehousePermission(ctx,'canViewFinance');if(!gate.ok)return gate.response;
 try{
  const p=req.nextUrl.searchParams, now=new Date();
  const from=new Date(p.get('from')?p.get('from')+'T00:00:00+03:00':now.getTime()-30*86400000);
  const to=new Date(p.get('to')?p.get('to')+'T23:59:59.999+03:00':now);
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>to||to.getTime()-from.getTime()>366*86400000)return NextResponse.json({error:'حدد فترة صحيحة لا تتجاوز سنة.'},{status:400});
  const canPurchases=hasWarehousePermission(gate.actor,'canViewPurchases'),canReps=hasWarehousePermission(gate.actor,'canViewReps');
  const date={gte:from,lte:to},base={warehouseId:ctx.warehouseId};
  const rows=await prisma.$transaction(async tx=>{
   const [payments,suppliers,collections,vouchers]=await Promise.all([
    tx.warehousePayment.findMany({where:{...base,receivedAt:date},include:{invoice:{select:{invoiceNumber:true,organization:{select:{name:true}}}}}}),
    canPurchases?tx.warehouseSupplierPayment.findMany({where:{...base,paidAt:date},include:{purchase:{select:{supplier:{select:{name:true}}}}}}):[],
    canReps?tx.warehouseRepCollection.findMany({where:{...base,collectedAt:date},include:{rep:{select:{name:true}}}}):[],
    tx.warehouseSettlement.findMany({where:{...base,createdAt:date}}),
   ]);
   return [
    ...payments.map(r=>({id:r.id,date:r.receivedAt,kind:'قبض فاتورة',party:r.invoice.organization.name,reference:r.reference??r.invoice.invoiceNumber,amount:r.amount,direction:'IN',method:r.method})),
    ...suppliers.map(r=>({id:r.id,date:r.paidAt,kind:'سداد مورد',party:r.purchase.supplier.name,reference:r.reference??'—',amount:r.amount,direction:'OUT',method:r.method})),
    ...collections.map(r=>({id:r.id,date:r.collectedAt,kind:'تحصيل مندوب',party:r.rep.name,reference:r.documentNumber,amount:r.amount,direction:'IN',method:'غير محددة'})),
    ...vouchers.map(r=>({id:r.id,date:r.createdAt,kind:r.kind==='PAYMENT_MATCH'?'مطابقة غير نقدية':r.kind==='OPENING_PAYMENT'?'قبض رصيد سابق':'رد مرتجع',party:'سند تسوية',reference:r.reference,amount:r.amount,direction:r.kind==='PAYMENT_MATCH'?'NEUTRAL':r.direction,method:r.kind==='PAYMENT_MATCH'?'مطابقة':'سند موثق'})),
   ];
  },{isolationLevel:'RepeatableRead',timeout:20000});
  const direction=p.get('direction')||'ALL';if(!['ALL','IN','OUT','NEUTRAL'].includes(direction))return NextResponse.json({error:'اتجاه غير صالح'},{status:400});
  const search=(p.get('search')||'').trim().toLocaleLowerCase();
  const filtered=rows.filter(r=>(direction==='ALL'||r.direction===direction)&&(!search||`${r.party} ${r.reference} ${r.kind}`.toLocaleLowerCase().includes(search))).sort((a,b)=>b.date.getTime()-a.date.getTime()||a.id.localeCompare(b.id));
  const sum=(kind:string)=>filtered.filter(r=>r.direction===kind).reduce((n,r)=>n+r.amount,0),paging=warehousePage(p);
  return NextResponse.json({rows:filtered.slice(paging.skip,paging.skip+paging.take),total:filtered.length,received:sum('IN'),paid:sum('OUT'),matched:sum('NEUTRAL'),includesSuppliers:canPurchases,includesReps:canReps});
 }catch(e){console.error('warehouse financial activity',e);return NextResponse.json({error:'تعذر تحميل سجل الحركة'},{status:500});}
}
