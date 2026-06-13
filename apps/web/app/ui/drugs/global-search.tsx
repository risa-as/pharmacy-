'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';

export default function GlobalDrugSearch({ placeholder }: { placeholder: string }) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();

    const handleSearch = useDebouncedCallback((term) => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('page', '1'); // Reset to page 1 on new search

        if (term) {
            params.set('query', term);
        } else {
            params.delete('query');
        }
        replace(`${pathname}?${params.toString()}`);
    }, 300); // 300ms debounce

    return (
        <div className="relative flex flex-1 flex-shrink-0">
            <label htmlFor="search" className="sr-only">
                بحث
            </label>
            <input
                className="peer block w-full rounded-lg border border-border bg-muted py-2.5 pr-10 pl-3 text-sm placeholder:text-muted-foreground font-cairo text-right transition focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                placeholder={placeholder}
                onChange={(e) => {
                    handleSearch(e.target.value);
                }}
                defaultValue={searchParams?.get('query')?.toString()}
            />
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground peer-focus:text-primary transition-colors" />
        </div>
    );
}
