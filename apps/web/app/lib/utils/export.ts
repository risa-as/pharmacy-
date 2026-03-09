// تصدير البيانات إلى Excel و PDF
import jsPDF from "jspdf";
import "jspdf-autotable";

// تصدير إلى CSV (يمكن فتحه في Excel)
export function exportToCSV(data: any[], filename: string, headers: string[]) {
    // Add BOM for Arabic support in Excel
    const BOM = "\uFEFF";

    const headerRow = headers.join(",");
    const dataRows = data.map((row: any) =>
        headers.map((header: any) => {
            const value = row[header] ?? "";
            // Escape commas and quotes
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        }).join(",")
    ).join("\n");

    const csvContent = BOM + headerRow + "\n" + dataRows;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// تصدير إلى PDF
export function exportToPDF(
    data: any[][],
    filename: string,
    title: string,
    headers: string[]
) {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    // Add Arabic font support (basic)
    doc.setFont("helvetica");

    // Title
    doc.setFontSize(18);
    doc.text(title, doc.internal.pageSize.getWidth() / 2, 20, { align: "center" });

    // Date
    doc.setFontSize(10);
    doc.text(
        new Date().toLocaleDateString("ar-IQ"),
        doc.internal.pageSize.getWidth() / 2,
        28,
        { align: "center" }
    );

    // Table
    (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 35,
        styles: {
            font: "helvetica",
            fontSize: 10,
            cellPadding: 3,
            halign: "right",
        },
        headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: "bold",
        },
        alternateRowStyles: {
            fillColor: [245, 247, 250],
        },
        margin: { top: 35, right: 14, bottom: 20, left: 14 },
    });

    doc.save(`${filename}.pdf`);
}

// Helper function to format data for export
export function formatDataForExport(
    data: any[],
    columnMapping: Record<string, string>
): { headers: string[]; rows: any[][] } {
    const headers = Object.values(columnMapping);
    const keys = Object.keys(columnMapping);

    const rows = data.map((item: any) =>
        keys.map((key: any) => {
            const value = item[key];
            if (value instanceof Date) {
                return value.toLocaleDateString("ar-IQ");
            }
            if (typeof value === "number") {
                return value.toFixed(2);
            }
            return value ?? "";
        })
    );

    return { headers, rows };
}
