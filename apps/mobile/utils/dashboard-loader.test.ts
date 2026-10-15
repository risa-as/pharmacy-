import { expect, it, vi } from 'vitest';
import { loadDashboardSections } from './dashboard-loader';
it('shows the main summary before the slower recent-sales request finishes', async () => {
    let release!: (v: string[]) => void;
    const primary = vi.fn(), secondary = vi.fn(), settled = vi.fn();
    const pending = loadDashboardSections(async () => ({ total: 50 }), () => new Promise<string[]>(r => { release = r; }), primary, secondary, vi.fn(), vi.fn(), settled);
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(primary).toHaveBeenCalledWith({ total: 50 }); expect(secondary).not.toHaveBeenCalled();
    release(['sale']); await pending; expect(secondary).toHaveBeenCalledWith(['sale']);
});
it('a secondary failure never replaces a successful summary with an error', async () => {
    const primary = vi.fn(), primaryError = vi.fn(), secondaryError = vi.fn();
    await loadDashboardSections(async () => 50, async () => { throw Error('slow sales failed'); }, primary, vi.fn(), primaryError, secondaryError, vi.fn());
    expect(primary).toHaveBeenCalledWith(50); expect(primaryError).not.toHaveBeenCalled(); expect(secondaryError).toHaveBeenCalledTimes(1);
});
