"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, Download } from "lucide-react";

interface ImportRow {
    name: string;
    barcode?: string;
    price: number;
    cost: number;
    quantity: number;
    expiryDate?: string;
    scientificName?: string;
    manufacturer?: string;
}

interface ImportResult {
    success: boolean;
    imported: number;
    updated: number;
    errors: string[];
    total: number;
}

function parseCSV(text: string): ImportRow[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    // Remove BOM if present
    const header = lines[0].replace(/^\uFEFF/, "").toLowerCase();
    const cols = header.split(",").map((c: any) => c.trim());

    // Map column names (Arabic + English)
    const nameIdx = cols.findIndex((c: any) =>
        ["name", "اسم الدواء", "الاسم", "اسم", "trade_name", "tradename", "drug"].some((k: any) => c.includes(k))
    );
    const barcodeIdx = cols.findIndex((c: any) =>
        ["barcode", "باركود", "الباركود", "code"].some((k: any) => c.includes(k))
    );
    const priceIdx = cols.findIndex((c: any) =>
        ["price", "السعر", "سعر البيع", "sell", "سعر"].some((k: any) => c.includes(k))
    );
    const costIdx = cols.findIndex((c: any) =>
        ["cost", "سعر الشراء", "التكلفة", "شراء", "purchase"].some((k: any) => c.includes(k))
    );
    const qtyIdx = cols.findIndex((c: any) =>
        ["quantity", "الكمية", "كمية", "qty", "stock"].some((k: any) => c.includes(k))
    );
    const expiryIdx = cols.findIndex((c: any) =>
        ["expiry", "انتهاء", "الصلاحية", "تاريخ الانتهاء", "expiry_date"].some((k: any) => c.includes(k))
    );
    const sciIdx = cols.findIndex((c: any) =>
        ["scientific", "الاسم العلمي", "علمي"].some((k: any) => c.includes(k))
    );
    const mfgIdx = cols.findIndex((c: any) =>
        ["manufacturer", "الشركة", "المصنع", "شركة"].some((k: any) => c.includes(k))
    );

    if (nameIdx === -1) return [];

    return lines.slice(1).filter((line: any) => line.trim()).map((line: any) => {
        const values = line.split(",").map((v: any) => v.trim().replace(/^"|"$/g, ""));
        return {
            name: values[nameIdx] || "",
            barcode: barcodeIdx >= 0 ? values[barcodeIdx] : undefined,
            price: priceIdx >= 0 ? parseFloat(values[priceIdx]) || 0 : 0,
            cost: costIdx >= 0 ? parseFloat(values[costIdx]) || 0 : 0,
            quantity: qtyIdx >= 0 ? parseInt(values[qtyIdx]) || 0 : 0,
            expiryDate: expiryIdx >= 0 ? values[expiryIdx] : undefined,
            scientificName: sciIdx >= 0 ? values[sciIdx] : undefined,
            manufacturer: mfgIdx >= 0 ? values[mfgIdx] : undefined,
        };
    }).filter((r: any) => r.name);
}

function formatIQD(n: number) {
    return new Intl.NumberFormat("ar-IQ").format(Math.round(n)) + " د.ع";
}

export default function DrugImportPage() {
    const [rows, setRows] = useState<ImportRow[]>([]);
    const [fileName, setFileName] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [mounted, setMounted] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Fix hydration error
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setResult(null);

        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const parsed = parseCSV(text);
            setRows(parsed);
        };
        reader.readAsText(file, "utf-8");
    };

    const handleImport = async () => {
        if (rows.length === 0) return;

        setLoading(true);
        try {
            const res = await fetch("/api/inventory/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows }),
            });
            const data = await res.json();
            setResult(data);
        } catch (err) {
            setResult({ success: false, imported: 0, updated: 0, errors: ["حدث خطأ في الاتصال"], total: 0 });
        }
        setLoading(false);
    };

    const downloadTemplate = () => {
        const csv = "\uFEFFاسم الدواء,الباركود,سعر البيع,سعر الشراء,الكمية,تاريخ الانتهاء,الاسم العلمي,الشركة\nأموكسيسيلين 500,6281001210019,5000,3500,100,2026-06-30,Amoxicillin,الحكمة\nباراسيتامول 500,6281001210020,2000,1200,200,2027-01-15,Paracetamol,سامراء";
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "import_template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="w-full max-w-5xl mx-auto" dir="rtl">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                    <FileSpreadsheet className="w-7 h-7 text-success" />
                    استيراد أدوية من ملف
                </h1>
                <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-xl text-sm font-bold hover:bg-success/10 transition-colors border border-green-200"
                >
                    <Download className="w-4 h-4" />
                    تحميل نموذج CSV
                </button>
            </div>

            {/* Upload Area */}
            <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary hover:bg-primary/10/30 transition-all group"
            >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                    {fileName || "اسحب ملف CSV هنا أو انقر للاختيار"}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                    يدعم ملفات CSV فقط. استخدم النموذج أعلاه كمرجع
                </p>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleFile}
                />
            </div>

            {/* Preview Table */}
            {rows.length > 0 && !result && (
                <div className="mt-6 bg-card rounded-2xl border border-border overflow-hidden">
                    <div className="p-4 border-b border-border bg-muted/50 flex justify-between items-center">
                        <h2 className="font-bold text-foreground">
                            معاينة البيانات ({rows.length} دواء)
                        </h2>
                        <button
                            onClick={handleImport}
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4" />
                            )}
                            {loading ? "جاري الاستيراد..." : "استيراد الكل"}
                        </button>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="w-full text-sm">
                            <thead className="bg-muted text-muted-foreground text-xs sticky top-0">
                                <tr>
                                    <th className="p-3 text-right font-medium">#</th>
                                    <th className="p-3 text-right font-medium">الاسم</th>
                                    <th className="p-3 text-right font-medium">الباركود</th>
                                    <th className="p-3 text-right font-medium">السعر</th>
                                    <th className="p-3 text-right font-medium">التكلفة</th>
                                    <th className="p-3 text-right font-medium">الكمية</th>
                                    <th className="p-3 text-right font-medium">الانتهاء</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((row: any, i: any) => (
                                    <tr key={i} className="hover:bg-primary/10/30">
                                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                                        <td className="p-3 font-medium text-foreground">{row.name}</td>
                                        <td className="p-3 text-muted-foreground" dir="ltr">{row.barcode || "—"}</td>
                                        <td className="p-3 text-muted-foreground">{formatIQD(row.price)}</td>
                                        <td className="p-3 text-muted-foreground">{formatIQD(row.cost)}</td>
                                        <td className="p-3 text-muted-foreground">{row.quantity}</td>
                                        <td className="p-3 text-muted-foreground">{row.expiryDate || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className={`mt-6 rounded-2xl p-6 border ${result.success ? 'bg-success/10 border-green-200' : 'bg-destructive/10 border-red-200'}`}>
                    <div className="flex items-center gap-3 mb-4">
                        {result.success ? (
                            <CheckCircle className="w-8 h-8 text-success" />
                        ) : (
                            <AlertTriangle className="w-8 h-8 text-destructive" />
                        )}
                        <h3 className="text-lg font-bold text-foreground">
                            {result.success ? "تم الاستيراد بنجاح!" : "حدث خطأ"}
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="bg-card rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-success">{result.imported}</p>
                            <p className="text-xs text-muted-foreground">دواء جديد</p>
                        </div>
                        <div className="bg-card rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-primary">{result.updated}</p>
                            <p className="text-xs text-muted-foreground">تم تحديثه</p>
                        </div>
                        <div className="bg-card rounded-xl p-3 text-center">
                            <p className="text-2xl font-bold text-muted-foreground">{result.total}</p>
                            <p className="text-xs text-muted-foreground">إجمالي الصفوف</p>
                        </div>
                    </div>
                    {result.errors.length > 0 && (
                        <div className="bg-card rounded-xl p-3">
                            <p className="text-xs font-bold text-destructive mb-2">أخطاء:</p>
                            {result.errors.map((e: any, i: any) => (
                                <p key={i} className="text-xs text-destructive/70">{e}</p>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={() => { setResult(null); setRows([]); setFileName(""); }}
                        className="mt-4 px-4 py-2 bg-card border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors"
                    >
                        استيراد ملف آخر
                    </button>
                </div>
            )}
        </div>
    );
}
