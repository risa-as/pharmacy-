import { Prisma } from '@prisma/client';

type Identity = { id: string; barcode: string; tradeName: string; scientificName: string; unitsPerPack: number | null };
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
export function sameReceiptMedicine(a: Identity, b: Identity) {
    return a.barcode.trim() === b.barcode.trim()
        && normalize(a.tradeName) === normalize(b.tradeName)
        && normalize(a.scientificName) === normalize(b.scientificName)
        && (a.unitsPerPack == null || b.unitsPerPack == null || a.unitsPerPack === b.unitsPerPack);
}

/** Keep the supplier's item unchanged; explicitly record where its stock was received. */
export async function receiptInventoryDrugs(tx: Prisma.TransactionClient, branchId: string, drugIds: string[]) {
    const branch = await tx.branch.findUniqueOrThrow({where:{id:branchId},select:{organizationId:true}});
    const scope = {warehouseId:null,OR:[{organizationId:null},{organizationId:branch.organizationId}]};
    const ids=Array.from(new Set(drugIds));
    const drugs = await tx.globalDrug.findMany({where:{id:{in:ids},...scope}});
    if (drugs.length !== ids.length || drugs.some(d=>!d.isActive)) throw Error('دواء الاستلام غير متاح ضمن المؤسسة.');
    const barcodes=drugs.map(d=>d.barcode);
    if(new Set(barcodes).size!==barcodes.length) throw Error('فاتورة الشراء تضم هويتين للباركود نفسه؛ راجع البنود قبل الاستلام.');
    const lockKeys=barcodes.map(code=>branchId+':receipt:'+code).sort();
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(key,0))::text FROM (SELECT unnest(ARRAY[${Prisma.join(lockKeys)}]::text[]) AS key ORDER BY key) ordered_keys`);
    const candidates = await tx.inventory.findMany({where:{branchId,drug:{barcode:{in:barcodes},...scope}},include:{drug:true}});
    const result=new Map<string,string>();
    for(const drug of drugs){
        const matches=candidates.filter(i=>i.drug.barcode===drug.barcode);
        if(matches.length>1) throw Error(`الباركود ${drug.barcode} له مخزونان؛ يلزم توحيدهما قبل الاستلام.`);
        const target=matches[0]?.drug;
        if(target && (!target.isActive || !sameReceiptMedicine(drug,target))) throw Error(`بيانات الدواء أو التعبئة لا تتطابق للباركود ${drug.barcode}؛ راجع الصنف قبل الاستلام.`);
        result.set(drug.id,target?.id||drug.id);
    }
    return result;
}
