/** Percentage change needs a real non-zero baseline, including for losses. */
export function chartChange(first: number, last: number): number | null {
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
    const change = ((last - first) / Math.abs(first)) * 100;
    return Number.isFinite(change) ? change : null;
}
