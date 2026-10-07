/** Yield between CPU batches so one large organization does not monopolize the server. */
export const yieldPlanning = () => new Promise<void>(resolve => setImmediate(resolve));
export async function mapPlanningRows<T, R>(rows: T[], fn: (row: T) => R): Promise<R[]> {
    const result: R[] = [];
    for (let i = 0; i < rows.length; i++) {
        if (i > 0 && i % 256 === 0) await yieldPlanning();
        result.push(fn(rows[i]));
    }
    return result;
}
