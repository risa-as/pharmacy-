'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { useTransition } from 'react';
import { Search, Loader2 } from 'lucide-react';

export default function BatchSearch({ currentQuery }: { currentQuery: string }) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const { replace } = useRouter();
    const [pending, startTransition] = useTransition();

    const handleSearch = useDebouncedCallback((term: string) => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('page', '1');
        if (term) params.set('query', term);
        else params.delete('query');
        startTransition(() => replace(`${pathname}?${params.toString()}`));
    }, 300);

    return (
        <div className="relative flex-1 min-w-[200px]" dir="rtl">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            {pending && <Loader2 aria-label="جارٍ البحث" className="absolute left-3 top-3 h-4 w-4 animate-spin text-primary" />}
            <input
                aria-busy={pending}
                type="text"
                className="w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
                placeholder="بحث باسم الدواء أو الباركود أو رقم الدفعة..."
                defaultValue={currentQuery}
                onChange={(e) => handleSearch(e.target.value)}
            />
        </div>
    );
}
