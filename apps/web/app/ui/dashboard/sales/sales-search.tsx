"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useCallback, useState, useTransition } from "react";

export default function SalesSearch() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [value, setValue] = useState(searchParams?.get("search") ?? "");

    const updateSearch = useCallback(
        (term: string) => {
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            if (term) {
                params.set("search", term);
                params.delete("page");
            } else {
                params.delete("search");
            }
            startTransition(() => {
                router.replace(`${pathname}?${params.toString()}`);
            });
        },
        [pathname, router, searchParams]
    );

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setValue(e.target.value);
        updateSearch(e.target.value);
    };

    const handleClear = () => {
        setValue("");
        updateSearch("");
    };

    return (
        <div className="relative w-full sm:w-80 group">
            {/* Search icon */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                {isPending ? (
                    <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                    <Search className="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors duration-200" />
                )}
            </div>

            <input
                type="text"
                value={value}
                onChange={handleChange}
                placeholder="بحث برقم الفاتورة أو اسم الدواء..."
                className="w-full pr-10 pl-9 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/60 transition-all duration-200 font-cairo shadow-sm"
                dir="rtl"
            />

            {/* Clear button */}
            {value && (
                <button
                    onClick={handleClear}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-muted hover:bg-border text-muted-foreground hover:text-foreground transition-all duration-150"
                    aria-label="مسح البحث"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
