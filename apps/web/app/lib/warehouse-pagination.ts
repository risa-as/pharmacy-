/** Read an entire bounded report range in deterministic database pages. No
 * silent row cap: an error aborts the report rather than presenting partial totals. */
export async function readWarehousePages<T extends { id: string }>(
    fetchPage: (args: { take: number; orderBy: { id: 'asc' }; cursor?: { id: string }; skip?: number }) => PromiseLike<T[]>,
): Promise<T[]> {
    const result: T[] = [];
    let cursor: string | undefined;
    for (;;) {
        const page = await fetchPage({ take: 500, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
        result.push(...page);
        if (page.length < 500) return result;
        const next = page[page.length - 1].id;
        if (next === cursor) throw new Error('Report pagination did not advance');
        cursor = next;
    }
}

export function warehousePage(params: URLSearchParams, size = 50) {
    const value = Number(params.get('page') ?? 1);
    const page = Number.isSafeInteger(value) && value > 0 ? Math.min(value, 1_000_000) : 1;
    return { page, pageSize: size, skip: (page - 1) * size, take: size };
}
