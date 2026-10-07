import { expect, it } from 'vitest';
import { mapPlanningRows } from '../planning-batch';

it('lets another event-loop callback run before a large calculation completes, preserving row order', async () => {
    let serviced = false, observedBeforeCompletion = false;
    setImmediate(() => { serviced = true; });
    const input = Array.from({ length: 1024 }, (_, i) => i);
    const output = await mapPlanningRows(input, i => {
        if (serviced) observedBeforeCompletion = true;
        return i * 2;
    });
    expect(observedBeforeCompletion).toBe(true);
    expect(output).toEqual(input.map(i => i * 2));
});
