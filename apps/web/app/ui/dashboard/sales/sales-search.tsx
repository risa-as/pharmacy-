"use client";

import TableSearch from "@/app/ui/table-search";

/** Same field and behaviour as the batches search, on the `search` parameter. */
export default function SalesSearch({ currentQuery }: { currentQuery: string }) {
    return <TableSearch currentQuery={currentQuery} param="search" placeholder="بحث برقم الفاتورة أو اسم الدواء..." />;
}
