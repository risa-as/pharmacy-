'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useWarehouseList<T>(url: string, key: string, params: string, initial: T[]) {
    const [items, setItems] = useState(initial);
    const [position, setPosition] = useState({ params, page: 1 });
    const page = position.params === params ? position.page : 1;
    const setPage = (page: number) => setPosition({ params, page });
    const [total, setTotal] = useState(initial.length);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const sequence = useRef(0);
    const refresh = useCallback(async (signal?: AbortSignal) => {
        const request = ++sequence.current;
        setLoading(true); setError('');
        try {
            const res = await fetch(`${url}?${params}&page=${page}`, { signal });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'تعذر تحميل البيانات');
            if (request === sequence.current) { setItems(data[key]); setTotal(data.total); }
            return data[key] as T[];
        } catch (e) {
            if (request === sequence.current && !signal?.aborted) setError(e instanceof Error ? e.message : 'تعذر الاتصال');
            return [] as T[];
        } finally { if (request === sequence.current) setLoading(false); }
    }, [url, key, params, page]);
    useEffect(() => {
        const controller = new AbortController();
        // Invalidate the prior response immediately, including during debounce.
        ++sequence.current;
        setLoading(true);
        const timer = setTimeout(() => { void refresh(controller.signal); }, 200);
        return () => { clearTimeout(timer); controller.abort(); ++sequence.current; };
    }, [refresh]);
    return { items, setItems, page, setPage, total, loading, error, refresh };
}
