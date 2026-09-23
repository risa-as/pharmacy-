import { expect, it } from 'vitest';
import { chartChange } from '../chart-change';
it('does not invent growth from a zero baseline', () => {
    expect(chartChange(0, 217000)).toBeNull();
    expect(chartChange(0, 0)).toBeNull();
});
it('distinguishes improvement and deterioration when profit starts negative', () => {
    expect(chartChange(-100, -50)).toBe(50);
    expect(chartChange(-100, -200)).toBe(-100);
    expect(chartChange(100, 120)).toBe(20);
});
