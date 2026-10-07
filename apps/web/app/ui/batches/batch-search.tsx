'use client';

import TableSearch from '@/app/ui/table-search';

export default function BatchSearch({
    currentQuery,
    placeholder = 'بحث باسم الدواء أو الباركود أو رقم الدفعة...',
}: {
    currentQuery: string;
    placeholder?: string;
}) {
    return <TableSearch currentQuery={currentQuery} placeholder={placeholder} />;
}
