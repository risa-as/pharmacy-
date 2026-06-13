"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, Download, ArrowRight, Globe } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportRow {
    tradeName: string;
    barcode: string;
    scientificName?: string;
    origin?: string;
}

interface ImportResult {
    success: boolean;
    imported: number;
    updated: number;
    errors: string[];
    total: number;
}

/** flexible column getter (Arabic + English keys) */
function buildGetter(row: Record<string, string>) {
    return (...keys: string[]) => {
        for (const k of keys) {
            for (const rk of Object.keys(row)) {
                if (rk.includes(k)) return row[rk];
            }
        }
        return "";
    };
}

function rowFrom(get: (...k: string[]) => string): ImportRow | null {
    const tradeName = get("الاسم التجاري", "اسم الدواء", "الاسم", "tradename", "trade_name", "name", "drug");
    if (!tradeName) return null;
    return {
        tradeName,
        barcode: get("barcode", "باركود", "الباركود", "code"),
        scientificName: get("scientific", "الاسم العلمي", "علمي") || undefined,
        origin: get("origin", "المصدر", "الشركة", "المصنع", "manufacturer", "شركة") || undefined,
    };
}

function parseExcel(buffer: ArrayBuffer): ImportRow[] {
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    return json.map((raw) => {
        const row: Record<string, string> = {};
        for (const k of Object.keys(raw)) row[k.toLowerCase().trim()] = String(raw[k]).trim();
        return rowFrom(buildGetter(row));
    }).filter(Boolean) as ImportRow[];
}

function parseCSV(text: string): ImportRow[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const header = lines[0].replace(/^﻿/, "").toLowerCase();
    const cols = header.split(",").map((c) => c.trim());
    return lines.slice(1).filter((l) => l.trim()).map((line) => {
        const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        cols.forEach((c, i) => { row[c] = values[i] ?? ""; });
        return rowFrom(buildGetter(row));
    }).filter(Boolean) as ImportRow[];
}

export default function AdminDrugImportPage() {
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [fileName, setFileName] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [mounted, setMounted] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setResult(null);
        const isExcel = /\.(xlsx|xls)$/i.test(file.name);
        const reader = new FileReader();
        if (isExcel) {
            reader.onload = (ev) => setRows(parseExcel(ev.target?.result as ArrayBuffer));
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (ev) => setRows(parseCSV(ev.target?.result as string));
            reader.readAsText(file, "utf-8");
        }
    };

    const handleImport = async () => {
        if (rows.length === 0) return;
        setLoading(true);
        try {
            const res = await fetch("/api/admin/drugs/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows }),
            });
            setResult(await res.json());
        } catch {
            setResult({ success: false, imported: 0, updated: 0, errors: ["حدث خطأ في الاتصال"], total: 0 });
        }
        setLoading(false);
    };

    const downloadTemplate = () => {
        const data = [
            ["الاسم التجاري", "الباركود", "الاسم العلمي", "المصدر"],
            ["أموكسيسيلين 500", "6281001210019", "Amoxicillin", "الحكمة"],
            ["باراسيتامول 500", "6281001210020", "Paracetamol", "سامراء"],
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "أدوية عالمية");
        XLSX.writeFile(wb, "global_drugs_template.xlsx");
    };

    const validCount = rows.filter((r) => r.barcode).length;
    const missingBarcode = rows.length - validCount;

    return (
        <div className="space-y-6 w-full max-w-4xl mx-auto" dir="rtl">
            {/* الرأس */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard/admin/drugs" className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold font-cairo text-foreground flex items-center gap-2">
                            <Globe className="w-6 h-6 text-blue-500" />
                            استيراد أدوية عالمية
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">المطابقة بالباركود — تُحدَّث الموجودة وتُضاف الجديدة</p>
                    </div>
                </div>
                <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success border border-success/20 rounded-lg text-sm font-bold hover:bg-success/20 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    تحميل نموذج Excel
                </button>
            </div>

            {/* شرح الآلية */}
            <div className="glass-card border-info/30 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-info shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">آلية الاستيراد:</span> يبحث النظام عن كل دواء بحسب <span className="font-bold">الباركود</span> —
                    إن وُجد دواء عالمي بنفس الباركود يُحدَّث (الاسم/العلمي/المصدر)، وإن لم يوجد يُضاف كدواء جديد. الأعمدة المطلوبة: <span className="font-mono">الاسم التجاري</span> و<span className="font-mono">الباركود</span>.
                </div>
            </div>

            {/* منطقة الرفع */}
            <div
                onClick={() => fileRef.current?.click()}
                className="glass-card border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
            >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-4" />
                <p className="text-lg font-medium text-foreground">
                    {fileName || "انقر لاختيار ملف CSV أو Excel"}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                    يدعم .xlsx و .xls و .csv — استخدم النموذج أعلاه كمرجع
                </p>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>

            {/* معاينة */}
            {rows.length > 0 && !result && (
                <div className="glass-card overflow-hidden">
                    <div className="p-4 border-b border-border flex justify-between items-center flex-wrap gap-3">
                        <div>
                            <h2 className="font-bold text-foreground">معاينة البيانات ({rows.length} دواء)</h2>
                            {missingBarcode > 0 && (
                                <p className="text-xs text-warning mt-0.5">⚠ {missingBarcode} صف بلا باركود سيُتجاهل</p>
                            )}
                        </div>
                        <button
                            onClick={handleImport}
                            disabled={loading || validCount === 0}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {loading ? "جاري الاستيراد..." : `استيراد ${validCount} دواء`}
                        </button>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/60 text-muted-foreground text-xs border-b border-border uppercase tracking-wide sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-right font-medium font-cairo">#</th>
                                    <th className="px-6 py-3 text-right font-medium font-cairo">الاسم التجاري</th>
                                    <th className="px-6 py-3 text-right font-medium font-cairo">الباركود</th>
                                    <th className="px-6 py-3 text-right font-medium font-cairo">الاسم العلمي</th>
                                    <th className="px-6 py-3 text-right font-medium font-cairo">المصدر</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {rows.map((row, i) => (
                                    <tr key={i} className={`hover:bg-muted/40 ${!row.barcode ? "opacity-50" : ""}`}>
                                        <td className="px-6 py-3 text-muted-foreground">{i + 1}</td>
                                        <td className="px-6 py-3 font-semibold text-foreground">{row.tradeName}</td>
                                        <td className="px-6 py-3 font-mono text-muted-foreground" dir="ltr">
                                            {row.barcode || <span className="text-warning">مفقود</span>}
                                        </td>
                                        <td className="px-6 py-3 text-muted-foreground">{row.scientificName || "—"}</td>
                                        <td className="px-6 py-3 text-muted-foreground">{row.origin || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* النتيجة */}
            {result && (
                <div className={`glass-card p-6 ${result.success ? "border-success/30" : "border-destructive/30"}`}>
                    <div className="flex items-center gap-3 mb-4">
                        {result.success ? <CheckCircle className="w-8 h-8 text-success" /> : <AlertTriangle className="w-8 h-8 text-destructive" />}
                        <h3 className="text-lg font-bold text-foreground">{result.success ? "تم الاستيراد بنجاح!" : "حدث خطأ"}</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="bg-muted/50 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-success">{result.imported}</p>
                            <p className="text-xs text-muted-foreground">دواء جديد</p>
                        </div>
                        <div className="bg-muted/50 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-primary">{result.updated}</p>
                            <p className="text-xs text-muted-foreground">تم تحديثه</p>
                        </div>
                        <div className="bg-muted/50 rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-foreground">{result.total}</p>
                            <p className="text-xs text-muted-foreground">إجمالي الصفوف</p>
                        </div>
                    </div>
                    {result.errors.length > 0 && (
                        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 max-h-40 overflow-y-auto">
                            <p className="text-xs font-bold text-destructive mb-2">تحذيرات ({result.errors.length}):</p>
                            {result.errors.map((e, i) => (
                                <p key={i} className="text-xs text-destructive/80">• {e}</p>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => { setResult(null); setRows([]); setFileName(""); }}
                            className="px-4 py-2 bg-card border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
                        >
                            استيراد ملف آخر
                        </button>
                        <Link
                            href="/dashboard/admin/drugs"
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                        >
                            العودة للقائمة
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
