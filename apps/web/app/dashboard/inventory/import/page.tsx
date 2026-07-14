'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
    FileSpreadsheet, Download, Upload, ArrowRight, CheckCircle2, AlertTriangle,
    Loader2, X, Package, RotateCcw,
} from 'lucide-react';

interface Branch { id: string; name: string; }

interface ParsedRow {
    name: string;
    barcode?: string;
    scientificName?: string;
    manufacturer?: string;
    price: number;
    cost: number;
    quantity: number;
    expiryDate?: string | number;
    batchNumber?: string;
    minStock?: number;
    maxStock?: number;
    /** null = valid, otherwise the validation error */
    error: string | null;
}

interface ImportResult {
    imported: number;
    updated: number;
    batches: number;
    errors: string[];
}

const CHUNK_SIZE = 100;

// ── Column header matching (Arabic + English variants) ───────────────────────
const COLUMN_KEYS: Record<string, string[]> = {
    name: ['اسم الدواء', 'الاسم التجاري', 'الاسم', 'name', 'trade'],
    barcode: ['باركود', 'الباركود', 'barcode', 'code'],
    scientificName: ['العلمي', 'scientific'],
    manufacturer: ['الشركة', 'المنشأ', 'المصنع', 'manufacturer', 'origin'],
    price: ['سعر البيع', 'البيع', 'price', 'sell'],
    cost: ['سعر الشراء', 'الشراء', 'التكلفة', 'cost', 'purchase'],
    quantity: ['الكمية', 'كمية', 'quantity', 'qty', 'stock'],
    expiryDate: ['الانتهاء', 'الصلاحية', 'expiry'],
    batchNumber: ['رقم الدفعة', 'الدفعة', 'batch'],
    minStock: ['الأدنى', 'الادنى', 'min'],
    maxStock: ['الأقصى', 'الاقصى', 'max'],
};

function matchColumns(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    const normalized = headers.map(h => String(h || '').trim().toLowerCase());
    for (const [field, keys] of Object.entries(COLUMN_KEYS)) {
        map[field] = normalized.findIndex(h => h && keys.some(k => h.includes(k.toLowerCase())));
    }
    return map;
}

/** Accepts Excel serial numbers, Date objects, and date strings. */
function isValidExpiry(value: string | number | undefined): boolean {
    if (value == null || value === '') return false;
    if (typeof value === 'number') return value >= 25569 && value <= 80000;
    return !isNaN(new Date(value).getTime());
}

function formatExpiry(value: string | number | undefined): string {
    if (value == null || value === '') return '—';
    const d = typeof value === 'number'
        ? new Date(Math.round((value - 25569) * 86_400_000))
        : new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
}

function validateRow(r: Omit<ParsedRow, 'error'>): string | null {
    if (!r.name) return 'اسم الدواء مفقود';
    if (!(Number(r.price) > 0)) return 'سعر البيع مفقود أو غير صالح';
    if (Number(r.quantity) > 0) {
        if (!(Number(r.cost) > 0)) return 'سعر الشراء مطلوب عند إدخال كمية';
        if (!isValidExpiry(r.expiryDate)) return 'تاريخ الانتهاء مفقود أو غير صالح';
    }
    return null;
}

export default function InventoryImportPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [branchId, setBranchId] = useState('');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState('');
    const [parseError, setParseError] = useState('');
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<ImportResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetch('/api/branches')
            .then(r => r.json())
            .then((data) => {
                const list: Branch[] = Array.isArray(data) ? data : [];
                setBranches(list);
                if (list.length === 1) setBranchId(list[0].id);
            })
            .catch(() => {});
    }, []);

    const validRows = useMemo(() => rows.filter(r => !r.error), [rows]);
    const invalidRows = useMemo(() => rows.filter(r => r.error), [rows]);

    // ── Template ──────────────────────────────────────────────────────────────
    const downloadTemplate = () => {
        const headers = ['اسم الدواء', 'الباركود', 'الاسم العلمي', 'الشركة', 'سعر البيع', 'سعر الشراء', 'الكمية', 'تاريخ الانتهاء', 'رقم الدفعة', 'الحد الأدنى', 'الحد الأقصى'];
        const example = [
            ['أموكسيسيلين 500 ملغ', '6281001210019', 'Amoxicillin', 'الحكمة', 5000, 3500, 100, '2027-06-30', 'B-2026-01', 10, 500],
            ['باراسيتامول 500 ملغ', '6281001210020', 'Paracetamol', 'سامراء', 2000, 1200, 200, '2027-01-15', '', 20, 1000],
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
        ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 25 : Math.max(12, h.length + 4) }));

        const instructions = [
            ['العمود', 'إلزامي؟', 'الشرح'],
            ['اسم الدواء', 'نعم', 'الاسم التجاري للدواء'],
            ['الباركود', 'مستحسن', 'تتم المطابقة بالباركود أولاً؛ إن لم يوجد الدواء يُنشأ جديداً ضمن مؤسستك'],
            ['الاسم العلمي', 'لا', 'يُستخدم عند إنشاء دواء جديد'],
            ['الشركة', 'لا', 'الشركة المصنّعة أو بلد المنشأ'],
            ['سعر البيع', 'نعم', 'سعر بيع الوحدة الواحدة (الشريط) بالدينار'],
            ['سعر الشراء', 'نعم عند وجود كمية', '⚠️ تكلفة الوحدة الواحدة (الشريط) — ليس سعر الباكيت! تُخزَّن على الدفعة وتُستخدم في حساب الأرباح'],
            ['الكمية', 'لا', 'عدد الوحدات المتوفرة — إن وُجدت تُنشأ دفعة بهذه الكمية'],
            ['تاريخ الانتهاء', 'نعم عند وجود كمية', 'بصيغة 2027-06-30 أو تاريخ Excel'],
            ['رقم الدفعة', 'لا', 'اختياري — يولَّد تلقائياً إن تُرك فارغاً'],
            ['الحد الأدنى', 'لا', 'حد تنبيه انخفاض المخزون'],
            ['الحد الأقصى', 'لا', 'الحد الأقصى للتخزين'],
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
        wsInfo['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 80 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المخزون');
        XLSX.utils.book_append_sheet(wb, wsInfo, 'تعليمات');
        XLSX.writeFile(wb, 'قالب-استيراد-المخزون.xlsx');
    };

    // ── File parsing ──────────────────────────────────────────────────────────
    const handleFile = async (file: File) => {
        setParseError('');
        setResult(null);
        setRows([]);
        setFileName(file.name);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (matrix.length < 2) { setParseError('الملف فارغ أو لا يحتوي صفوف بيانات'); return; }

            const cols = matchColumns(matrix[0].map(String));
            if (cols.name === -1) { setParseError('لم يُعثر على عمود "اسم الدواء" — استخدم القالب المرفق'); return; }

            const get = (line: any[], field: string) => (cols[field] >= 0 ? line[cols[field]] : '');
            const num = (v: any) => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };

            const parsed: ParsedRow[] = matrix.slice(1)
                .filter(line => line.some(cell => String(cell).trim() !== ''))
                .map(line => {
                    const raw = {
                        name: String(get(line, 'name') ?? '').trim(),
                        barcode: String(get(line, 'barcode') ?? '').trim() || undefined,
                        scientificName: String(get(line, 'scientificName') ?? '').trim() || undefined,
                        manufacturer: String(get(line, 'manufacturer') ?? '').trim() || undefined,
                        price: num(get(line, 'price')),
                        cost: num(get(line, 'cost')),
                        quantity: Math.floor(num(get(line, 'quantity'))),
                        expiryDate: (get(line, 'expiryDate') === '' ? undefined : get(line, 'expiryDate')) as string | number | undefined,
                        batchNumber: String(get(line, 'batchNumber') ?? '').trim() || undefined,
                        minStock: cols.minStock >= 0 && String(get(line, 'minStock')).trim() !== '' ? Math.floor(num(get(line, 'minStock'))) : undefined,
                        maxStock: cols.maxStock >= 0 && String(get(line, 'maxStock')).trim() !== '' ? Math.floor(num(get(line, 'maxStock'))) : undefined,
                    };
                    return { ...raw, error: validateRow(raw) };
                });

            if (parsed.length === 0) { setParseError('لا توجد صفوف بيانات في الملف'); return; }
            setRows(parsed);
        } catch (e) {
            console.error(e);
            setParseError('تعذر قراءة الملف — تأكد أنه ملف Excel صالح (.xlsx / .csv)');
        }
    };

    // ── Import execution (chunked) ────────────────────────────────────────────
    const runImport = async () => {
        if (!branchId || validRows.length === 0 || importing) return;
        setImporting(true);
        setProgress(0);
        const total: ImportResult = { imported: 0, updated: 0, batches: 0, errors: [] };
        try {
            for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
                const chunk = validRows.slice(i, i + CHUNK_SIZE).map(({ error: _e, ...r }) => r);
                const res = await fetch('/api/inventory/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rows: chunk, branchId }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'فشل الاستيراد');
                total.imported += data.imported ?? 0;
                total.updated += data.updated ?? 0;
                total.batches += data.batches ?? 0;
                total.errors.push(...(data.errors ?? []));
                setProgress(Math.round(Math.min(100, ((i + chunk.length) / validRows.length) * 100)));
            }
            setResult(total);
            setRows([]);
            setFileName('');
        } catch (e: any) {
            total.errors.push(e?.message || 'انقطع الاستيراد — أعد المحاولة');
            setResult(total);
        } finally {
            setImporting(false);
        }
    };

    const reset = () => {
        setRows([]); setFileName(''); setParseError(''); setResult(null); setProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-5" dir="rtl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-success/10 rounded-xl flex items-center justify-center">
                        <FileSpreadsheet className="w-5 h-5 text-success" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">استيراد المخزون من Excel</h1>
                        <p className="text-sm text-muted-foreground">رفع ملف أصناف كامل: أدوية، أسعار، كميات ودفعات</p>
                    </div>
                </div>
                <Link
                    href="/dashboard/inventory"
                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-bold text-foreground hover:bg-muted transition-colors"
                >
                    <ArrowRight className="w-4 h-4" />
                    عودة للمخزون
                </Link>
            </div>

            {/* Result panel */}
            {result && (
                <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-success" />
                        <h2 className="font-bold text-foreground">اكتمل الاستيراد</h2>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-success/10 rounded-lg p-4 text-center">
                            <p className="text-2xl font-black text-success tabular-nums">{result.imported}</p>
                            <p className="text-xs font-bold text-success mt-1">دواء جديد</p>
                        </div>
                        <div className="bg-primary/10 rounded-lg p-4 text-center">
                            <p className="text-2xl font-black text-primary tabular-nums">{result.updated}</p>
                            <p className="text-xs font-bold text-primary mt-1">صنف محدَّث</p>
                        </div>
                        <div className="bg-muted rounded-lg p-4 text-center">
                            <p className="text-2xl font-black text-foreground tabular-nums">{result.batches}</p>
                            <p className="text-xs font-bold text-muted-foreground mt-1">دفعة مُضافة</p>
                        </div>
                    </div>
                    {result.errors.length > 0 && (
                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                            <p className="text-sm font-bold text-destructive mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4" />
                                أخطاء ({result.errors.length})
                            </p>
                            <ul className="text-xs text-destructive/80 space-y-1 max-h-40 overflow-y-auto">
                                {result.errors.map((err, i) => <li key={i}>• {err}</li>)}
                            </ul>
                        </div>
                    )}
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        استيراد ملف آخر
                    </button>
                </div>
            )}

            {!result && (
                <>
                    {/* Step 1: template + branch + file */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <p className="text-sm font-bold text-foreground mb-1">1. حمّل القالب</p>
                            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">يحتوي ورقة "تعليمات" تشرح كل عمود — انتبه أن سعر الشراء هو تكلفة الوحدة وليس الباكيت.</p>
                            <button
                                onClick={downloadTemplate}
                                className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success border border-success/30 rounded-lg text-sm font-bold hover:bg-success/20 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                تحميل القالب
                            </button>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-5">
                            <p className="text-sm font-bold text-foreground mb-1">2. اختر الفرع</p>
                            <p className="text-xs text-muted-foreground mb-3">الفرع الذي ستُضاف إليه الكميات والأسعار.</p>
                            <select
                                value={branchId}
                                onChange={e => setBranchId(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                            >
                                <option value="">اختر الفرع...</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-5">
                            <p className="text-sm font-bold text-foreground mb-1">3. ارفع الملف</p>
                            <p className="text-xs text-muted-foreground mb-3">ملف .xlsx أو .csv — ستظهر معاينة قبل التنفيذ.</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                اختيار ملف
                            </button>
                            {fileName && (
                                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-success shrink-0" />
                                    <span className="truncate">{fileName}</span>
                                    <button onClick={reset} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                                </p>
                            )}
                        </div>
                    </div>

                    {parseError && (
                        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-sm text-destructive font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            {parseError}
                        </div>
                    )}

                    {/* Step 2: preview */}
                    {rows.length > 0 && (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                    <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
                                        <Package className="w-4 h-4 text-muted-foreground" />
                                        معاينة قبل الاستيراد
                                    </h2>
                                    <span className="px-2.5 py-1 rounded-lg bg-success/10 text-success text-xs font-bold tabular-nums">{validRows.length} صالح</span>
                                    {invalidRows.length > 0 && (
                                        <span className="px-2.5 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-bold tabular-nums">{invalidRows.length} خطأ</span>
                                    )}
                                </div>
                                <button
                                    onClick={runImport}
                                    disabled={!branchId || validRows.length === 0 || importing}
                                    className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {importing ? `جاري الاستيراد... ${progress}%` : `تنفيذ الاستيراد (${validRows.length})`}
                                </button>
                            </div>

                            {!branchId && (
                                <div className="px-5 py-2.5 bg-warning/10 text-warning text-xs font-bold border-b border-border">
                                    اختر الفرع أولاً لتفعيل زر الاستيراد
                                </div>
                            )}

                            {importing && (
                                <div className="h-1.5 bg-muted">
                                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                                </div>
                            )}

                            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                                <table className="w-full text-right text-sm">
                                    <thead className="bg-muted/60 text-muted-foreground text-xs font-bold sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2.5">#</th>
                                            <th className="px-4 py-2.5">اسم الدواء</th>
                                            <th className="px-4 py-2.5">الباركود</th>
                                            <th className="px-4 py-2.5">سعر البيع</th>
                                            <th className="px-4 py-2.5">سعر الشراء</th>
                                            <th className="px-4 py-2.5">الكمية</th>
                                            <th className="px-4 py-2.5">الانتهاء</th>
                                            <th className="px-4 py-2.5">الحالة</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {rows.map((r, i) => (
                                            <tr key={i} className={r.error ? 'bg-destructive/5' : ''}>
                                                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                                                <td className="px-4 py-2.5 font-bold text-foreground">{r.name || '—'}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground tabular-nums" dir="ltr">{r.barcode || '—'}</td>
                                                <td className="px-4 py-2.5 tabular-nums">{r.price ? r.price.toLocaleString() : '—'}</td>
                                                <td className="px-4 py-2.5 tabular-nums">{r.cost ? r.cost.toLocaleString() : '—'}</td>
                                                <td className="px-4 py-2.5 tabular-nums">{r.quantity || '—'}</td>
                                                <td className="px-4 py-2.5 tabular-nums" dir="ltr">{formatExpiry(r.expiryDate)}</td>
                                                <td className="px-4 py-2.5">
                                                    {r.error ? (
                                                        <span className="text-xs font-bold text-destructive flex items-center gap-1">
                                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                                            {r.error}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-success flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            صالح
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
