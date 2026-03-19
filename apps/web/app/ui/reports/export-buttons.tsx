"use client";

import { Download, Printer } from "lucide-react";

/** Export table data as a CSV file that Excel can open */
export function ExportExcelButton({
    data,
    headers,
    filename = "report",
    className,
}: {
    data: (string | number)[][];
    headers: string[];
    filename?: string;
    className?: string;
}) {
    const handleExport = () => {
        const BOM = "\uFEFF"; // UTF-8 BOM so Arabic shows correctly in Excel
        const csvRows = [
            headers.join(","),
            ...data.map((row) =>
                row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
            ),
        ];
        const blob = new Blob([BOM + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <button
            onClick={handleExport}
            className={
                className ??
                "print:hidden flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-bold text-success-foreground transition-colors hover:bg-success/90"
            }
        >
            <Download className="h-4 w-4" />
            تصدير Excel
        </button>
    );
}

/** Print the current page as PDF using the browser's print dialog */
export function ExportPDFButton({ className }: { className?: string }) {
    return (
        <button
            onClick={() => window.print()}
            className={
                className ??
                "print:hidden flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            }
        >
            <Printer className="h-4 w-4" />
            طباعة / PDF
        </button>
    );
}
