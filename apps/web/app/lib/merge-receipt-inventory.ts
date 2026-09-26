import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { sameReceiptMedicine } from './receipt-drug-identity';

/** Explicit maintenance operation; never called by ordinary receipt or barcode search. */
export async function mergeReceiptInventory(db: PrismaClient, input: {
    branchId: string; sourceId: string; targetId: string; actorId: string; dryRun?: boolean; expectedPlanHash?: string;
}) {
    return db.$transaction(async tx => {
        const actor = await tx.user.findUnique({where:{id:input.actorId}});
        if (!actor || !actor.isActive || actor.role !== 'SUPER_ADMIN') throw Error('يتطلب اعتماد مدير المنصة.');
        const branch = await tx.branch.findUniqueOrThrow({where:{id:input.branchId}});
        const rows = await tx.inventory.findMany({where:{id:{in:[input.sourceId,input.targetId]},branchId:branch.id},include:{drug:true,batches:true}});
        const source = rows.find(r=>r.id===input.sourceId), target=rows.find(r=>r.id===input.targetId);
        if (!source || !target || source.id === target.id) throw Error('حدد مخزونين موجودين ومختلفين داخل الفرع نفسه.');
        if (source.drug.organizationId !== null || source.drug.warehouseId !== null || target.drug.organizationId !== branch.organizationId || target.drug.warehouseId !== null
            || !sameReceiptMedicine(source.drug,target.drug)) throw Error('لا تتطابق هوية الدواء العام والخاص ضمن المؤسسة.');
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${branch.id + ':receipt:' + source.drug.barcode}, 0))::text`;
        // Stock operations that have used the source identity require a fuller history migration.
        if (await tx.saleItem.count({where:{drugId:source.drugId,sale:{branchId:branch.id}}})
            || await tx.transferItem.count({where:{drugId:source.drugId}})) throw Error('للصنف العام مبيعات أو تحويلات؛ يلزم تدقيق تاريخ الحركات قبل التسوية.');
        await tx.$queryRaw`SELECT id FROM "Inventory" WHERE id IN (${source.id},${target.id}) ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Batch" WHERE "inventoryId" IN (${source.id},${target.id}) ORDER BY id FOR UPDATE`;
        const batches = await tx.batch.findMany({where:{inventoryId:{in:[source.id,target.id]}},orderBy:{id:'asc'}});
        const moved = batches.filter(b=>b.inventoryId===source.id);
        const receipts=await tx.purchaseItem.findMany({where:{drugId:source.drugId,purchase:{branchId:branch.id}}});
        if(receipts.some(item=>item.receivedDrugId && ![source.drugId,target.drugId].includes(item.receivedDrugId)))
            throw Error('بند استلام مرتبط بهوية مخزون أخرى؛ يلزم تدقيقه قبل التسوية.');
        const plan = {branchId:branch.id,sourceId:source.id,targetId:target.id,barcode:source.drug.barcode,
            sourceDrugId:source.drugId,targetDrugId:target.drugId,
            sourceSettings:{price:source.price,cost:source.cost,minStock:source.minStock,maxStock:source.maxStock},
            quantityBefore:batches.reduce((sum,b)=>sum+b.quantity,0),preservedSellingPrice:target.price,
            preservedMinStock:target.minStock,preservedMaxStock:target.maxStock,
            batches:moved.map(b=>({id:b.id,quantity:b.quantity,initialQuantity:b.initialQuantity,expiryDate:b.expiryDate,costPrice:b.costPrice,supplierId:b.supplierId,purchaseItemId:b.purchaseItemId})),
            receiptItems:receipts.map(item=>({id:item.id,previousReceivedDrugId:item.receivedDrugId})).sort((a,b)=>a.id.localeCompare(b.id))};
        if (input.dryRun) return plan;
        if (input.expectedPlanHash && createHash('sha256').update(JSON.stringify(plan)).digest('hex') !== input.expectedPlanHash)
            throw Error('تغيرت البيانات بعد مراجعة الخطة؛ ألغيت التسوية.');
        await tx.purchaseItem.updateMany({where:{drugId:source.drugId,purchase:{branchId:branch.id}},data:{receivedDrugId:target.drugId}});
        await tx.batch.updateMany({where:{inventoryId:source.id},data:{inventoryId:target.id}});
        await tx.inventory.delete({where:{id:source.id}});
        const after=await tx.batch.aggregate({where:{inventoryId:target.id},_sum:{quantity:true}});
        if (after._sum.quantity !== plan.quantityBefore) throw Error('فشلت مطابقة مجموع المخزون؛ ألغيت التسوية.');
        await tx.auditLog.create({data:{userId:actor.id,userName:actor.name||actor.email,action:'MERGE_RECEIPT_INVENTORY',entity:'INVENTORY',entityId:target.id,branchId:branch.id,details:JSON.stringify(plan)}});
        return plan;
    },{isolationLevel:'Serializable',maxWait:10000,timeout:30000});
}
