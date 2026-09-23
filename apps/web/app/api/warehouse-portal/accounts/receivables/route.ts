import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { getWarehouseContext } from '@/app/lib/warehouse-context';
import { requireWarehousePermission } from '@/app/lib/warehouse-permission-guard';
import { agingBucket } from '@/app/lib/warehouse-accounts';
import { warehousePage } from '@/app/lib/warehouse-pagination';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const ctx = await getWarehouseContext();
    if (ctx instanceof NextResponse) return ctx;
    const gate = await requireWarehousePermission(ctx, 'canViewFinance');
    if (!gate.ok) return gate.response;
    try {
        const params = req.nextUrl.searchParams;
        const paging = warehousePage(params);
        const source = params.get('source') || 'ALL';
        const aging = params.get('aging') || 'ALL';
        if (!['ALL','PLATFORM','FIELD','OPENING'].includes(source) || !['ALL','OVERDUE','CURRENT','D30','D60','D90','D90_PLUS'].includes(aging)) return NextResponse.json({error:'فلتر غير صالح'}, {status:400});
        const where = { warehouseId: ctx.warehouseId, status: { in: ['UNPAID', 'PARTIAL'] as ('UNPAID'|'PARTIAL')[] } };
        const [invoices, fieldSales, opening] = await prisma.$transaction([
            prisma.warehouseInvoice.findMany({where, select:{id:true,organizationId:true,invoiceNumber:true,total:true,paidAmount:true,dueAt:true,issuedAt:true,organization:{select:{name:true}}}}),
            prisma.warehouseFieldSale.findMany({where, select:{id:true,organizationId:true,customerName:true,invoiceNumber:true,total:true,paidAmount:true,soldAt:true,organization:{select:{name:true}}}}),
            prisma.warehouseCustomer.findMany({where:{warehouseId:ctx.warehouseId,openingBalance:{gt:0}},select:{id:true,organizationId:true,openingBalance:true,createdAt:true,organization:{select:{name:true}}}}),
        ], { isolationLevel: 'RepeatableRead' });
        const now = new Date();
        const rows = [
            ...invoices.map(i=>({id:i.id,organizationId:i.organizationId,customer:i.organization.name,reference:i.invoiceNumber,source:'PLATFORM',remaining:Math.max(0,i.total-i.paidAmount),dueAt:i.dueAt,createdAt:i.issuedAt,aging:agingBucket(i.dueAt,now)})),
            ...fieldSales.map(i=>({id:i.id,organizationId:i.organizationId,customer:i.organization?.name ?? i.customerName,reference:i.invoiceNumber,source:'FIELD',remaining:Math.max(0,i.total-i.paidAmount),dueAt:null,createdAt:i.soldAt,aging:'CURRENT'})),
            ...opening.map(i=>({id:i.id,organizationId:i.organizationId,customer:i.organization.name,reference:'رصيد افتتاحي',source:'OPENING',remaining:i.openingBalance,dueAt:null,createdAt:i.createdAt,aging:'CURRENT'})),
        ].filter(i=>i.remaining>0);
        const search=(params.get('search')||'').trim().toLocaleLowerCase();
        const filtered=rows.filter(i=>(source==='ALL'||i.source===source) && (aging==='ALL'||(aging==='OVERDUE'?i.aging!=='CURRENT':i.aging===aging)) && (!search||`${i.customer} ${i.reference}`.toLocaleLowerCase().includes(search)));
        filtered.sort((a,b)=> (Number(b.aging!=='CURRENT')-Number(a.aging!=='CURRENT')) || b.remaining-a.remaining || a.id.localeCompare(b.id));
        return NextResponse.json({rows:filtered.slice(paging.skip,paging.skip+paging.take),total:filtered.length,page:paging.page,pageSize:paging.pageSize,filteredOutstanding:filtered.reduce((sum,i)=>sum+i.remaining,0)});
    } catch(e) {
        console.error('warehouse receivables',e);
        return NextResponse.json({error:'تعذر تحميل دفتر الذمم'}, {status:500});
    }
}
