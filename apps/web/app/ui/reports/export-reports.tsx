"use client";

import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Button } from "@faramace/ui";
import { Download, FileSpreadsheet, FileText, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { fetchReportData } from "@/app/lib/actions/reports";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export default function ExportReports() {
    const [isExporting, setIsExporting] = useState(false);
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [reportType, setReportType] = useState<"sales" | "purchases" | "inventory" | "expenses">("sales");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [mounted, setMounted] = useState(false);

    // Data & Refs
    const [pdfData, setPdfData] = useState<any[]>([]);
    const [summaryData, setSummaryData] = useState<{ count: number, total: number } | null>(null);

    const printRef = useRef<HTMLDivElement>(null);
    const tableHeadRef = useRef<HTMLTableSectionElement>(null);
    const tableBodyRef = useRef<HTMLTableSectionElement>(null);
    const tableFootRef = useRef<HTMLTableSectionElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const generatePdf = async (data: any[], type: string) => {
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!printRef.current || !tableHeadRef.current || !tableBodyRef.current) return;

        try {
            // 1. Capture Header
            const headerCanvas = await html2canvas(tableHeadRef.current, { scale: 2 });
            const headerImg = headerCanvas.toDataURL('image/png');

            // 2. Capture Footer (Summary) if exists
            let footerImg = null;
            let footerCanvas: HTMLCanvasElement | null = null;
            if (tableFootRef.current) {
                footerCanvas = await html2canvas(tableFootRef.current, { scale: 2 });
                footerImg = footerCanvas.toDataURL('image/png');
            }

            // 3. Capture Body
            const bodyCanvas = await html2canvas(tableBodyRef.current, { scale: 2 });

            // 4. Calculate Dimensions
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth(); // 297mm
            const pageHeight = pdf.internal.pageSize.getHeight(); // 210mm
            const margin = 10;
            const contentWidth = pageWidth - (margin * 2);

            const pdfHeaderHeight = (headerCanvas.height * contentWidth) / headerCanvas.width;
            const pdfFooterHeight = footerImg ? ((footerCanvas!.height * contentWidth) / footerCanvas!.width) : 0;
            const pdfBodyTotalHeight = (bodyCanvas.height * contentWidth) / bodyCanvas.width;

            // 5. Calculate Page Breaks based on Row Heights
            const rows = Array.from(tableBodyRef.current.children) as HTMLElement[];
            const rowHeights = rows.map((row: any) => {
                // Scale DOM height to PDF height
                // Ratio: pdfBodyTotalHeight / domBodyHeight matches bodyCanvas.height / domBodyHeight approx
                const domBodyHeight = tableBodyRef.current!.scrollHeight;
                const scale = pdfBodyTotalHeight / domBodyHeight;
                return row.offsetHeight * scale;
            });

            // 6. Generate Pages
            let currentY = 0; // Current position in the PDF body virtual space
            let pageNum = 1;

            while (currentY < pdfBodyTotalHeight) {
                // Determine max height available for body on this page
                // Last page might need space for footer
                // We don't know if this is the last page yet, so we assume it is NOT, unless we fit everything.
                // Actually, correct logic: Check if remaining content + footer fits.

                const remainingBody = pdfBodyTotalHeight - currentY;
                const availableHeightNormal = pageHeight - (margin * 2) - pdfHeaderHeight;
                const availableHeightLast = availableHeightNormal - pdfFooterHeight;

                let isLastPage = false;
                let pageSliceHeight = 0;

                if (remainingBody <= availableHeightLast) {
                    // Fits on one last page with footer
                    isLastPage = true;
                    pageSliceHeight = remainingBody;
                } else {
                    // Need to find break point
                    // Accumulate row heights until we exceed availableHeightNormal
                    let accumulated = 0;
                    let rowCountInSlice = 0;

                    // We need to map currentY back to a row index? 
                    // Better: iterate rows and check which ones are fully INSIDE the [currentY, currentY + available] window?
                    // Problem: rowHeights is a flat list. content is continuous.

                    // Let's traverse rowHeights tracking 'rowTop' relative to body start
                    let rowTop = 0;
                    let foundCut = false;

                    for (const h of rowHeights) {
                        if (rowTop >= currentY - 0.1) { // This row starts at or after our current cut
                            if ((rowTop + h - currentY) <= availableHeightNormal) {
                                // Row fits in this page
                                accumulated += h;
                                rowCountInSlice++;
                            } else {
                                // Row does NOT fit. Break here.
                                pageSliceHeight = accumulated;
                                foundCut = true;
                                break;
                            }
                        }
                        rowTop += h;
                    }

                    if (!foundCut && rowTop > currentY) {
                        // We ran out of rows (should have been caught by isLastPage check, but safety)
                        pageSliceHeight = remainingBody;
                    }

                    // If a single row is taller than the page (unlikely but possible), forcing cut
                    if (pageSliceHeight === 0 && remainingBody > 0) {
                        pageSliceHeight = availableHeightNormal; // Force cut (ugly but prevents infinite loop)
                    }
                }

                // Add Header
                if (pageNum > 1) pdf.addPage();
                pdf.addImage(headerImg, 'PNG', margin, margin, contentWidth, pdfHeaderHeight);

                // Add Body Slice
                if (pageSliceHeight > 0) {
                    const sourceY = (currentY * bodyCanvas.height) / pdfBodyTotalHeight;
                    const sourceH = (pageSliceHeight * bodyCanvas.height) / pdfBodyTotalHeight;

                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = bodyCanvas.width;
                    sliceCanvas.height = sourceH;

                    const ctx = sliceCanvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(bodyCanvas, 0, sourceY, bodyCanvas.width, sourceH, 0, 0, bodyCanvas.width, sourceH);
                        const sliceData = sliceCanvas.toDataURL('image/png');
                        pdf.addImage(sliceData, 'PNG', margin, margin + pdfHeaderHeight, contentWidth, pageSliceHeight);
                    }
                }

                // Add Footer if last page
                if (isLastPage && footerImg) {
                    pdf.addImage(footerImg, 'PNG', margin, margin + pdfHeaderHeight + pageSliceHeight, contentWidth, pdfFooterHeight);
                }

                currentY += pageSliceHeight;
                pageNum++;

                // Safety break
                if (pageNum > 100) break;
            }

            pdf.save(`report_${type}_${new Date().toISOString().split("T")[0]}.pdf`);
            toast.success("تم تصدير ملف PDF بنجاح");
        } catch (err) {
            console.error(err);
            toast.error("فشل تحويل التقرير إلى PDF");
        }
    };

    const handleExport = async (formatType: "excel" | "pdf", specificType?: string) => {
        setIsExporting(true);
        try {
            const typeToFetch = specificType || reportType;
            const start = startDate ? startDate : undefined;
            const end = endDate ? endDate : undefined;

            const fetchedData = await fetchReportData(typeToFetch as any, start, end);

            if (!fetchedData || fetchedData.length === 0) {
                toast.error("لا توجد بيانات للتصدير في هذه الفترة");
                setIsExporting(false);
                return;
            }

            // Transform Data: Add Sequence ID
            const processedData = fetchedData.map((item: any, index: any) => ({
                "#": index + 1,
                ...item
            }));

            // Calculate Summary
            // Assuming "السعر الكلي" or "Total" or "المبلغ" or "total" exists
            let totalAmount = 0;
            processedData.forEach((row: any) => {
                const val = row["السعر الكلي"] || row["Total"] || row["المبلغ"] || row["total"] || row["التكلفة"] || 0;
                totalAmount += Number(val) || 0;
            });

            setSummaryData({
                count: processedData.length,
                total: totalAmount
            });

            if (formatType === "excel") {
                const ws = XLSX.utils.json_to_sheet(processedData);
                // Add Summary Row to Excel
                XLSX.utils.sheet_add_json(ws, [{ "": "الاجماااالي", "عدد الطلبات": processedData.length, "المجموع الكلي": totalAmount }], { origin: -1, skipHeader: true });

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Report");
                XLSX.writeFile(wb, `report_${typeToFetch}_${new Date().toISOString().split("T")[0]}.xlsx`);
                toast.success("تم تصدير ملف Excel بنجاح");
            } else if (formatType === "pdf") {
                setPdfData(processedData);
                setTimeout(() => generatePdf(processedData, typeToFetch), 1000); // More time for render
                return;
            }
        } catch (error) {
            console.error(error);
            toast.error("حدث خطأ أثناء التصدير");
        } finally {
            if (formatType !== "pdf") {
                setIsExporting(false);
                setShowCustomModal(false);
                setSummaryData(null);
            }
            if (formatType === "pdf") {
                setTimeout(() => {
                    setIsExporting(false);
                    setShowCustomModal(false);
                    setPdfData([]);
                    setSummaryData(null);
                }, 5000);
            }
        }
    };

    return (
        <div className="flex gap-3">
            {/* Hidden Printable Area */}
            <div style={{ position: "absolute", top: "-10000px", left: 0, width: "100%", zIndex: -1 }}>
                <div ref={printRef} className="p-8 bg-card text-right" dir="rtl" style={{ width: "297mm", minHeight: "210mm", fontFamily: 'sans-serif' }}>
                    <div className="mb-4 text-center">
                        <h1 className="text-2xl font-bold mb-2">تقرير فاراماس</h1>
                        <p className="text-muted-foreground">التاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
                    </div>

                    {pdfData.length > 0 && (
                        <table className="w-full border-collapse border border-border text-sm">
                            <thead ref={tableHeadRef}>
                                <tr className="bg-muted">
                                    {Object.keys(pdfData[0]).map((key: any) => (
                                        <th key={key} className="border border-border p-2 font-bold whitespace-nowrap">{key}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody ref={tableBodyRef}>
                                {pdfData.map((row: any, idx: any) => (
                                    <tr key={idx} className="even:bg-muted">
                                        {Object.values(row).map((val: any, i) => (
                                            <td key={i} className="border border-border p-2 text-center">{val}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            {summaryData && (
                                <tfoot ref={tableFootRef} className="bg-muted font-bold">
                                    <tr>
                                        <td colSpan={Object.keys(pdfData[0]).length} className="border border-border p-4">
                                            <div className="flex justify-between px-8 text-lg">
                                                <span>عدد العناصر: {summaryData.count}</span>
                                                <span>الإجمالي الكلي: {summaryData.total.toLocaleString()}</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    )}
                </div>
            </div>

            <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport("excel", "sales")} // Quick export for current sales
                disabled={isExporting}
            >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
            </Button>

            <Button
                variant="outline"
                className="gap-2"
                onClick={() => handleExport("pdf", "sales")} // Quick export for current sales
                disabled={isExporting}
            >
                <FileText className="w-4 h-4" />
                <span>تصدير PDF</span>
            </Button>

            <Button
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => setShowCustomModal(true)}
            >
                <CalendarIcon className="w-4 h-4" />
                <span>تقرير مخصص</span>
            </Button>

            {/* Custom Report Modal */}
            {showCustomModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 space-y-4" dir="rtl">
                        <h3 className="text-xl font-bold text-foreground">إنشاء تقرير مخصص</h3>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">نوع التقرير</label>
                                <select
                                    className="w-full rounded-lg border-border border p-2"
                                    value={reportType}
                                    onChange={(e) => setReportType(e.target.value as any)}
                                >
                                    <option value="sales">المبيعات</option>
                                    <option value="purchases">المشتريات</option>
                                    <option value="inventory">المخزون</option>
                                    <option value="expenses">المصروفات</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">من تاريخ</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-lg border-border border p-2"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">إلى تاريخ</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-lg border-border border p-2"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t">
                            <Button
                                className="flex-1 gap-2"
                                onClick={() => handleExport("excel")}
                                disabled={isExporting}
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                                تصدير Excel
                            </Button>
                            <Button
                                className="flex-1 gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                onClick={() => handleExport("pdf")}
                                disabled={isExporting}
                            >
                                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                تصدير PDF
                            </Button>
                        </div>

                        <button
                            onClick={() => setShowCustomModal(false)}
                            className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
