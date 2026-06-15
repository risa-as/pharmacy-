"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";

/**
 * Downloads the detailed profit Excel workbook for the period currently shown
 * on the profits report page (reads from/to/fromTime/toTime/branch from the URL
 * so the file always matches the on-screen filters).
 */
export default function ExportProfitButton() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const key of ["from", "to", "fromTime", "toTime", "branch"]) {
        const v = searchParams?.get(key);
        if (v) params.set(key, v);
      }
      const res = await fetch(`/api/reports/profit/export?${params.toString()}`);
      if (!res.ok) {
        let msg = "تعذّر إنشاء الملف.";
        try {
          const data = await res.json();
          msg = data?.error || data?.message || msg;
        } catch {
          /* non-JSON error */
        }
        alert(msg);
        return;
      }

      const blob = await res.blob();
      // Derive filename from the response, falling back to the period.
      const disposition = res.headers.get("Content-Disposition") || "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const asciiMatch = disposition.match(/filename="([^"]+)"/i);
      const filename = utf8Match
        ? decodeURIComponent(utf8Match[1])
        : asciiMatch?.[1] || "profit-report.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Profit export failed:", e);
      alert("حدث خطأ أثناء إنشاء الملف.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="print:hidden flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-bold text-success-foreground transition-colors hover:bg-success/90 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {loading ? "جارٍ الإنشاء…" : "تصدير Excel مفصّل"}
    </button>
  );
}
