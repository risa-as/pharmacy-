// The server accepts at most 100 records per read. Keep the initial 5,000-row
// bound and complete-period summary while avoiding two requests for 51–99 rows.
export const SALES_PAGE_LIMIT = 100;
const MAX_INITIAL_PAGES = 50;

export async function readSalesPages<T>(
    fetchPage: (offset: number, limit: number) => Promise<T[]>,
    offset: number,
    append: boolean,
    signal: AbortSignal,
) {
    const rows: T[] = [];
    let page: T[] = [];
    let nextOffset = append ? offset : 0;
    let count = 0;
    do {
        if (signal.aborted) throw Object.assign(new Error('Read cancelled'), { name: 'AbortError' });
        page = await fetchPage(nextOffset, SALES_PAGE_LIMIT);
        if (signal.aborted) throw Object.assign(new Error('Read cancelled'), { name: 'AbortError' });
        rows.push(...page);
        nextOffset += page.length;
        count++;
    } while (!append && page.length === SALES_PAGE_LIMIT && count < MAX_INITIAL_PAGES);
    return { rows, hasMore: page.length === SALES_PAGE_LIMIT };
}
