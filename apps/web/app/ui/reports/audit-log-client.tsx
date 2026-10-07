"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  RotateCcw,
  RefreshCw,
  Laptop,
  ClipboardList,
  AlertCircle,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import DateRangeFilter from "./date-range-filter";
import TablePagination from "../table-pagination";
import {
  TableCard,
  DataTable,
  THead,
  Th,
  DateTimeCell,
  StatusPill,
} from "../data-table";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditDetails,
  auditSource,
  type AuditEntry,
} from "./audit-log-display";
interface Props {
  users: { id: string; name: string | null }[];
  branches: { id: string; name: string }[];
}
export default function AuditLogClient({ users, branches }: Props) {
  const params = useSearchParams(),
    router = useRouter();
  const from = params?.get("from") || "",
    to = params?.get("to") || "";
  const [logs, setLogs] = useState<AuditEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1),
    [totalPages, setTotalPages] = useState(1),
    [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState("");
  const [userId, setUser] = useState(""),
    [entity, setEntity] = useState(""),
    [action, setAction] = useState(""),
    [branchId, setBranch] = useState("");
  const requestRef = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    setPage(1);
  }, [from, to]);
  const fetchLogs = useCallback(async () => {
    const sequence = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "30" });
      Object.entries({
        search,
        userId,
        entity,
        action,
        branchId,
        from,
        to,
      }).forEach(([k, v]) => {
        if (v) query.set(k, v);
      });
      const response = await fetch(`/api/audit-log?${query}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "تعذر تحميل سجل النشاطات.");
      if (
        !Array.isArray(result.logs) ||
        !result.pagination ||
        typeof result.pagination.total !== "number"
      )
        throw Error("تعذر قراءة بيانات السجل.");
      if (sequence !== requestRef.current) return;
      if (page > Math.max(1, result.pagination.totalPages)) {
        setPage(Math.max(1, result.pagination.totalPages));
        return;
      }
      setLogs(result.logs);
      setTotalPages(Math.max(1, result.pagination.totalPages));
      setTotal(result.pagination.total);
      setLoaded(true);
    } catch (e) {
      if (sequence === requestRef.current)
        setError(e instanceof Error ? e.message : "تعذر تحميل سجل النشاطات.");
    } finally {
      if (sequence === requestRef.current) setLoading(false);
    }
  }, [page, search, userId, entity, action, branchId, from, to]);
  useEffect(() => {
    void fetchLogs();
    return () => {
      requestRef.current++;
    };
  }, [fetchLogs]);
  const filterCount = [
    searchInput,
    userId,
    entity,
    action,
    branchId,
    from || to,
  ].filter(Boolean).length;
  const branchNames = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );
  const reset = () => {
    setSearchInput("");
    setSearch("");
    setUser("");
    setEntity("");
    setAction("");
    setBranch("");
    setPage(1);
    router.push("/dashboard/reports/audit-log");
  };
  const selectClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all";
  const empty =
    error && !loaded
      ? "تعذر تحميل السجل"
      : filterCount
        ? "لا توجد نشاطات تطابق الفلاتر"
        : "لا توجد نشاطات مسجّلة بعد";
  return (
    <div className="space-y-4">
      <DateRangeFilter
        baseUrl="/dashboard/reports/audit-log"
        currentFrom={from}
        currentTo={to}
      />
      <div className="glass-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            تصفية النشاطات
          </h2>
          {filterCount > 0 && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              مسح الفلاتر ({filterCount})
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label
              htmlFor="audit-search"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              البحث في السجل
            </label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                id="audit-search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="اسم المستخدم، تفاصيل النشاط أو المرجع..."
                className={`${selectClass} pr-9`}
              />
            </div>
          </div>
          {[
            {
              id: "user",
              label: "المستخدم",
              value: userId,
              set: setUser,
              options: users.map((u) => [u.id, u.name || "مستخدم بلا اسم"]),
            },
            {
              id: "entity",
              label: "القسم",
              value: entity,
              set: setEntity,
              options: Object.entries(AUDIT_ENTITIES),
            },
            {
              id: "action",
              label: "الإجراء",
              value: action,
              set: setAction,
              options: Object.entries(AUDIT_ACTIONS).map(([k, v]) => [
                k,
                v.label,
              ]),
            },
            {
              id: "branch",
              label: "الفرع",
              value: branchId,
              set: setBranch,
              options: branches.map((b) => [b.id, b.name]),
            },
          ].map((f) => (
            <div key={f.id}>
              <label
                htmlFor={`audit-${f.id}`}
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                {f.label}
              </label>
              <select
                id={`audit-${f.id}`}
                value={f.value}
                onChange={(e) => {
                  f.set(e.target.value);
                  setPage(1);
                }}
                className={selectClass}
              >
                <option value="">الكل</option>
                {f.options.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {error}
            {loaded && (
              <p className="text-xs mt-1">
                المعروض آخر نتيجة تم تحميلها؛ قد لا يطابق الفلاتر الحالية. اضغط
                تحديث للمحاولة مجددًا.
              </p>
            )}
          </div>
        </div>
      )}
      <TableCard>
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold">النشاطات المسجّلة</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {loaded
                  ? `${total.toLocaleString("en-US")} نشاط ضمن الفلاتر المحددة`
                  : "جارٍ تحميل السجل…"}
              </p>
            </div>
          </div>
          <button
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
            تحديث
          </button>
        </div>
        {loading && (
          <div
            role="status"
            className="px-4 py-2 bg-primary/5 text-xs text-primary"
          >
            جارٍ تحديث النشاطات…
          </div>
        )}
        {!loaded && loading ? (
          <div className="space-y-3 p-6" aria-label="جارٍ تحميل النشاطات">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-10 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-14 px-5 text-center">
            <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium text-sm">{empty}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error
                ? "استخدم زر التحديث لإعادة المحاولة."
                : "ستظهر هنا النشاطات المسجّلة عند تنفيذ العمليات."}
            </p>
          </div>
        ) : (
          <DataTable>
            <THead>
              <Th>التاريخ والوقت</Th>
              <Th>المستخدم</Th>
              <Th>الإجراء</Th>
              <Th>القسم</Th>
              <Th>الفرع</Th>
              <Th>التفاصيل والمرجع</Th>
            </THead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => {
                const info = AUDIT_ACTIONS[log.action] || {
                    label: log.action,
                    tone: "muted" as const,
                  },
                  fields = auditDetails(log.details),
                  source = auditSource(log.details);
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-3 align-top">
                      <DateTimeCell date={log.createdAt} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="text-sm font-medium whitespace-nowrap">
                        {log.userName || "غير معروف"}
                      </p>
                      {source.kind !== "unknown" && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                          {source.kind === "desktop" && (
                            <Laptop className="w-3 h-3" />
                          )}
                          {source.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <StatusPill tone={info.tone}>{info.label}</StatusPill>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {AUDIT_ENTITIES[log.entity] || log.entity}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {log.branchId
                        ? branchNames.get(log.branchId) || "فرع غير متاح"
                        : "غير مرتبط بفرع"}
                    </td>
                    <td className="px-3 py-3 align-top min-w-[220px] max-w-[420px]">
                      <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                        {fields.length
                          ? fields
                              .map((f) => `${f.label}: ${f.value}`)
                              .join(" · ")
                          : log.entity === "MOBILE_OPERATION"
                            ? "سجل تنفيذ للعملية؛ تفاصيلها في مستندها الأصلي."
                            : "لا توجد تفاصيل إضافية"}
                      </p>
                      {(fields.length > 0 || log.entityId) && (
                        <details className="mt-1.5 group">
                          <summary className="text-xs text-primary cursor-pointer inline-flex items-center gap-1 list-none">
                            عرض التفاصيل
                            <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                          </summary>
                          <dl className="mt-2 p-3 rounded-lg bg-muted/40 space-y-2 text-xs">
                            {fields.map((f, i) => (
                              <div key={i}>
                                <dt className="font-medium text-foreground">
                                  {f.label}
                                </dt>
                                <dd className="text-muted-foreground mt-0.5 break-words whitespace-pre-wrap">
                                  {f.value}
                                </dd>
                              </div>
                            ))}
                            {log.entityId && (
                              <div>
                                <dt className="font-medium">مرجع السجل</dt>
                                <dd
                                  dir="ltr"
                                  className="text-muted-foreground break-all text-right font-mono mt-0.5"
                                >
                                  {log.entityId}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalCount={total}
          unit="نشاط"
          onPageChange={setPage}
        />
      </TableCard>
      <p className="text-xs text-muted-foreground">
        الأوقات بتوقيت بغداد. سجلات المزامنة تظهر بعد وصول العملية إلى الخادم؛
        بلاغ التطبيق لا يُعد إثباتًا لتنفيذ العملية.
      </p>
    </div>
  );
}
