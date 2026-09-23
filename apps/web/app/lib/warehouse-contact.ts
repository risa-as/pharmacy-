export const WAREHOUSE_PHONE_FIELDS = ['salesPhone', 'followupPhone', 'managementPhone'] as const;
export type WarehousePhones = Partial<Record<typeof WAREHOUSE_PHONE_FIELDS[number], string | null>>;
export function warehouseContacts(phones: WarehousePhones) {
    const labels = { salesPhone: 'المبيعات', followupPhone: 'المتابعة', managementPhone: 'الإدارة' };
    return WAREHOUSE_PHONE_FIELDS.flatMap(key => {
        const number = phones[key]?.trim();
        return number ? [{ label: labels[key], number }] : [];
    });
}
