import { useLayoutEffect, useRef } from 'react';
import { registerUpdateProtection } from '../services/update-protection';

/** Keeps hidden tab forms protected, even when another tab is selected. */
export function useUpdateProtection(blocked: boolean) {
    const ref = useRef(blocked);
    ref.current = blocked;
    useLayoutEffect(() => registerUpdateProtection(() => ref.current), []);
}
