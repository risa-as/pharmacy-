"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "lucide-react";

interface Counts {
  total: number;
  shortage: number;
  good: number;
  surplus: number;
  low?: number; // 0 < stock < minStock (اختياري — يُعرض فقط إذا مُرِّر)
}

const BASE_TABS = [
  {
    key: "",
    label: "الكل",
    color: "text-foreground",
    activeColor: "bg-primary text-primary-foreground",
  },
  {
    key: "shortage",
    label: "نفد",
    color: "text-destructive",
    activeColor: "bg-destructive text-white",
  },
  {
    key: "good",
    label: "جيد",
    color: "text-green-600",
    activeColor: "bg-green-600 text-white",
  },
  {
    key: "surplus",
    label: "فائض",
    color: "text-amber-600",
    activeColor: "bg-amber-600 text-white",
  },
  {
    key: "low",
    label: "منخفض",
    color: "text-warning",
    activeColor: "bg-warning text-white",
  },
] as const;

export default function InventoryFilters({
  counts,
  currentStatus,
  currentQuery,
}: {
  counts: Counts;
  currentStatus: string;
  currentQuery: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();

  const showLow = counts.low !== undefined;
  const tabs = showLow
    ? [BASE_TABS[0], BASE_TABS[1], BASE_TABS[4], BASE_TABS[2], BASE_TABS[3]]
    : [...BASE_TABS];

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    params.delete("status");
    if (term) params.set("query", term);
    else params.delete("query");
    replace(`${pathname}?${params.toString()}`);
  }, 300);

  const handleStatus = (status: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    if (status) params.set("status", status);
    else params.delete("status");
    replace(`${pathname}?${params.toString()}`);
  };

  const getCount = (key: string) => {
    if (key === "") return counts.total;
    if (key === "shortage") return counts.shortage;
    if (key === "good") return counts.good;
    if (key === "surplus") return counts.surplus;
    if (key === "low") return counts.low ?? 0;
    return 0;
  };

  const displayCount = getCount(currentStatus);

  return (
    <div className="flex items-center gap-3 flex-wrap" dir="rtl">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          className="w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
          placeholder="بحث بالاسم التجاري أو العلمي أو الباركود..."
          defaultValue={currentQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 shrink-0">
        {tabs.map((tab) => {
          const isActive = currentStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleStatus(tab.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold transition-all ${
                isActive ? tab.activeColor : `${tab.color} hover:bg-background`
              }`}
            >
              {tab.label}
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 font-mono ${
                  isActive ? "bg-white/20" : "bg-muted"
                }`}
              >
                {getCount(tab.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Result Count */}
      <span className="text-sm text-muted-foreground font-medium shrink-0 whitespace-nowrap">
        {displayCount} نتيجة
      </span>
    </div>
  );
}
