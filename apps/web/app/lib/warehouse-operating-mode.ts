export type WarehouseOperatingMode = 'FULL' | 'ORDER_PORTAL';
export const MODE_LABELS = { FULL: 'إدارة المذخر بالكامل', ORDER_PORTAL: 'استقبال وتجهيز طلبات الصيدليات' };
export const FULL_ONLY_WRITES = new Set(['canReceiveStock','canAdjustStock','canWriteOffStock','canCreatePurchase','canPaySupplier','canManageReps','canSellField']);
export type ShipmentLot = {drugId:string;batchNumber:string;expiryDate:string;quantity:number};
export function validatePortalShipment(value: unknown, expected: {drugId:string;quantity:number}[]): ShipmentLot[] {
 if (!Array.isArray(value) || !value.length || value.length > 2000) throw new Error('أدخل دفعات الشحنة الفعلية.');
 const totals = new Map<string,number>(); const seen = new Set<string>();
 const lots = value.map((r:any) => {
  if (!r || typeof r.drugId !== 'string' || !expected.some(i=>i.drugId===r.drugId) || typeof r.batchNumber !== 'string' || !r.batchNumber.trim() || r.batchNumber.length>100 || typeof r.expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.expiryDate) || !Number.isFinite(Date.parse(r.expiryDate)) || new Date(r.expiryDate).toISOString().slice(0,10)!==r.expiryDate || new Date(r.expiryDate)<=new Date() || !Number.isSafeInteger(r.quantity) || r.quantity<=0) throw new Error('راجع الصنف ورقم الدفعة والصلاحية والكمية؛ الكمية بالباكيت.');
  const key = [r.drugId,r.batchNumber.trim(),r.expiryDate].join('|'); if(seen.has(key)) throw new Error('الدفعة مكررة؛ اجمع كميتها في سطر واحد.'); seen.add(key);
  totals.set(r.drugId,(totals.get(r.drugId)||0)+r.quantity);
  return {drugId:r.drugId,batchNumber:r.batchNumber.trim(),expiryDate:r.expiryDate,quantity:r.quantity};
 });
 for(const item of expected) if(totals.get(item.drugId)!==item.quantity) throw new Error('مجموع دفعات كل دواء يجب أن يساوي الكمية المعتمدة مع البونص.');
 return lots;
}
