"use client";

import { useEffect, useRef, useTransition } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";
import { Loader2, Search } from "lucide-react";

interface Counts {
  total: number;
  shortage: number;
  good: number;
  surplus: number;
  low?: number;
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
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const stripRef = useRef<HTMLDivElement>(null);

  /**
   * On phones the tab strip scrolls, and a re-render puts it back at the
   * start — which can leave the tab you just picked off-screen. Pull the
   * active one back into view. `block: "nearest"` keeps this from scrolling
   * the page vertically.
   */
  useEffect(() => {
    stripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentStatus]);

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
    startTransition(() => replace(`${pathname}?${params.toString()}`));
  }, 300);

  const handleStatus = (status: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", "1");
    if (status) params.set("status", status);
    else params.delete("status");
    startTransition(() => replace(`${pathname}?${params.toString()}`));
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
    /**
     * Mobile (<sm): stacks into two rows — search on top, then the tab strip
     * beside the result count. The five status tabs are ~520px wide, far more
     * than a phone viewport, so the strip scrolls horizontally instead of
     * pushing the whole page sideways.
     */
    <div
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
      dir="rtl"
    >
      {/* Search */}
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          className="w-full rounded-lg border border-border bg-background py-2 pr-9 pl-3 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
          placeholder="بحث بالاسم التجاري أو العلمي أو الباركود..."
          defaultValue={currentQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 min-w-0">
        {/* Status Tabs */}
        <div
          ref={stripRef}
          className={`flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 min-w-0 overflow-x-auto transition-opacity duration-200 ${
            isPending ? "opacity-60 pointer-events-none" : ""
          }`}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {tabs.map((tab) => {
            const isActive = currentStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleStatus(tab.key)}
                disabled={isPending}
                data-active={isActive}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold transition-all ${
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

        {/**
         * Result Count / Loading.
         * The count always equals the active tab's own badge, so on phones it
         * is hidden rather than stealing ~110px from the tab strip. The
         * loading state still shows at every width.
         */}
        <span
          className={`text-sm text-muted-foreground font-medium shrink-0 whitespace-nowrap items-center gap-1.5 ${
            isPending ? "flex" : "hidden sm:flex"
          }`}
        >
          {isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {/* Text would shove the tab strip ~90px narrower mid-tap on phones */}
              <span className="hidden sm:inline">جاري التحميل...</span>
            </>
          ) : (
            `${displayCount} نتيجة`
          )}
        </span>
      </div>
    </div>
  );
}
