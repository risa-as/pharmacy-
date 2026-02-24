'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Printer, Plus, Minus, Trash2 } from 'lucide-react';

interface Drug {
    id: string;
    barcode: string;
    tradeName: string;
    price: number;
}

interface PrintItem {
    drug: Drug;
    copies: number;
}

export default function BarcodePrintPage() {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Drug[]>([]);
    const [items, setItems] = useState<PrintItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [labelSize, setLabelSize] = useState<'small' | 'medium' | 'large'>('medium');
    const printRef = useRef<HTMLDivElement>(null);

    // Search drugs
    useEffect(() => {
        if (search.length < 2) { setResults([]); return; }
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/inventory?search=${encodeURIComponent(search)}&limit=10`);
                const data = await res.json();
                const drugs = (data || []).map((inv: any) => ({
                    id: inv.drugId || inv.id,
                    barcode: inv.drug?.barcode || inv.barcode || '',
                    tradeName: inv.drug?.tradeName || inv.tradeName || '',
                    price: inv.price || 0
                }));
                setResults(drugs);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const addItem = (drug: Drug) => {
        setItems(prev => {
            const existing = prev.find(i => i.drug.barcode === drug.barcode);
            if (existing) {
                return prev.map(i => i.drug.barcode === drug.barcode ? { ...i, copies: i.copies + 1 } : i);
            }
            return [...prev, { drug, copies: 1 }];
        });
        setSearch('');
        setResults([]);
    };

    const updateCopies = (barcode: string, delta: number) => {
        setItems(prev => prev.map(i =>
            i.drug.barcode === barcode ? { ...i, copies: Math.max(1, i.copies + delta) } : i
        ));
    };

    const removeItem = (barcode: string) => {
        setItems(prev => prev.filter(i => i.drug.barcode !== barcode));
    };

    const handlePrint = () => {
        const printContent = printRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const sizeMap = {
            small: { width: '30mm', height: '20mm', fontSize: '7px', barcodeHeight: 25 },
            medium: { width: '50mm', height: '25mm', fontSize: '9px', barcodeHeight: 35 },
            large: { width: '70mm', height: '35mm', fontSize: '11px', barcodeHeight: 45 },
        };
        const size = sizeMap[labelSize];

        // Generate barcode labels
        let labelsHTML = '';
        for (const item of items) {
            for (let i = 0; i < item.copies; i++) {
                labelsHTML += `
                    <div class="label" style="width:${size.width};height:${size.height};border:1px dashed #ccc;padding:2mm;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;margin:1mm;page-break-inside:avoid;box-sizing:border-box;">
                        <div style="font-size:${size.fontSize};font-weight:bold;text-align:center;margin-bottom:1mm;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.drug.tradeName}</div>
                        <svg class="barcode" data-barcode="${item.drug.barcode}" style="width:90%;height:${size.barcodeHeight}px;"></svg>
                        <div style="font-size:${size.fontSize};text-align:center;margin-top:1mm;">${item.drug.barcode}</div>
                        <div style="font-size:${size.fontSize};font-weight:bold;text-align:center;">${item.drug.price.toLocaleString()} د.ع</div>
                    </div>
                `;
            }
        }

        printWindow.document.write(`
            <html dir="rtl">
            <head>
                <title>طباعة باركود</title>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
                <style>
                    @page { margin: 2mm; }
                    body { font-family: Arial, sans-serif; margin: 0; padding: 2mm; display: flex; flex-wrap: wrap; }
                    @media print { .label { border: none !important; } }
                </style>
            </head>
            <body>
                ${labelsHTML}
                <script>
                    document.querySelectorAll('.barcode').forEach(svg => {
                        try {
                            JsBarcode(svg, svg.dataset.barcode, {
                                format: "CODE128",
                                displayValue: false,
                                height: ${size.barcodeHeight},
                                margin: 0,
                                width: 1.5,
                            });
                        } catch(e) { console.error(e); }
                    });
                    setTimeout(() => window.print(), 500);
                <\/script>
            </body>
            </html>
        `);
    };

    const totalLabels = items.reduce((sum, i) => sum + i.copies, 0);

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground">🏷️ طباعة الباركود</h1>

            {/* Search & Add */}
            <div className="bg-card rounded-xl shadow-sm border p-4">
                <label className="block text-sm font-medium text-muted-foreground mb-2">بحث عن دواء لإضافته</label>
                <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="اكتب اسم الدواء أو الباركود..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pr-10 pl-4 py-3 border rounded-lg text-sm bg-muted focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Search Results */}
                {results.length > 0 && (
                    <div className="mt-2 bg-card border rounded-lg shadow-md max-h-60 overflow-y-auto">
                        {results.map((drug) => (
                            <button
                                key={drug.barcode}
                                onClick={() => addItem(drug)}
                                className="w-full text-right px-4 py-3 hover:bg-primary/10 border-b last:border-b-0 transition-colors flex items-center justify-between"
                            >
                                <div>
                                    <div className="font-medium text-foreground">{drug.tradeName}</div>
                                    <div className="text-xs text-muted-foreground">{drug.barcode} · {drug.price.toLocaleString()} د.ع</div>
                                </div>
                                <Plus className="w-4 h-4 text-primary" />
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Selected Items */}
            {items.length > 0 && (
                <div className="bg-card rounded-xl shadow-sm border p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-foreground">الأدوية المحددة ({items.length} دواء · {totalLabels} ملصق)</h2>
                        <div className="flex items-center gap-3">
                            <select
                                value={labelSize}
                                onChange={(e) => setLabelSize(e.target.value as any)}
                                className="border rounded-lg px-3 py-2 text-sm bg-muted"
                            >
                                <option value="small">صغير (30×20mm)</option>
                                <option value="medium">متوسط (50×25mm)</option>
                                <option value="large">كبير (70×35mm)</option>
                            </select>
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm"
                            >
                                <Printer className="w-4 h-4" />
                                طباعة ({totalLabels})
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {items.map((item) => (
                            <div key={item.drug.barcode} className="flex items-center justify-between p-3 bg-muted rounded-lg border">
                                <div>
                                    <div className="font-medium text-foreground">{item.drug.tradeName}</div>
                                    <div className="text-xs text-muted-foreground">{item.drug.barcode} · {item.drug.price.toLocaleString()} د.ع</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => updateCopies(item.drug.barcode, -1)}
                                        className="p-1 rounded bg-muted hover:bg-border"><Minus className="w-3 h-3" /></button>
                                    <span className="w-8 text-center font-bold">{item.copies}</span>
                                    <button onClick={() => updateCopies(item.drug.barcode, 1)}
                                        className="p-1 rounded bg-muted hover:bg-border"><Plus className="w-3 h-3" /></button>
                                    <button onClick={() => removeItem(item.drug.barcode)}
                                        className="p-1 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive mr-2"><Trash2 className="w-3 h-3" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {items.length === 0 && (
                <div className="text-center py-20 text-muted-foreground">
                    <Printer className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>ابحث عن أدوية أعلاه وأضفها لطباعة ملصقات الباركود</p>
                </div>
            )}

            {/* Hidden print div for reference */}
            <div ref={printRef} className="hidden" />
        </div>
    );
}
