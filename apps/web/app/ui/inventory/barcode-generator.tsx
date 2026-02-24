"use client";

import { useState } from "react";
import { Barcode, Printer, X } from "lucide-react";

interface BarcodeGeneratorProps {
    barcode: string;
    drugName: string;
    price: number;
    isOpen: boolean;
    onClose: () => void;
}

export default function BarcodeGenerator({ barcode, drugName, price, isOpen, onClose }: BarcodeGeneratorProps) {
    const [quantity, setQuantity] = useState(1);

    if (!isOpen) return null;

    // Generate simple barcode pattern (Code 128 simplified visualization)
    const generateBarcodePattern = (code: string) => {
        const bars = [];
        for (let i = 0; i < code.length; i++) {
            const charCode = code.charCodeAt(i);
            // Generate pattern based on character
            bars.push(charCode % 2 === 0 ? "thin" : "thick");
            bars.push(charCode % 3 === 0 ? "thin" : "thick");
        }
        return bars;
    };

    const pattern = generateBarcodePattern(barcode);

    const handlePrint = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const labels = Array(quantity).fill(null).map(() => `
            <div style="
                width: 200px;
                padding: 16px;
                border: 1px dashed #ccc;
                margin: 8px;
                display: inline-block;
                text-align: center;
                font-family: Arial, sans-serif;
            ">
                <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px;">${drugName}</div>
                <div style="
                    display: flex;
                    justify-content: center;
                    gap: 1px;
                    margin: 8px 0;
                ">
                    ${pattern.map(bar => `
                        <div style="
                            width: ${bar === "thick" ? "3px" : "1px"};
                            height: 40px;
                            background: #000;
                        "></div>
                    `).join("")}
                </div>
                <div style="font-family: monospace; font-size: 10px; margin-top: 4px;">${barcode}</div>
                <div style="font-weight: bold; font-size: 14px; margin-top: 8px;">${price.toFixed(2)}</div>
            </div>
        `).join("");

        printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <title>طباعة ملصقات</title>
                <style>
                    @media print {
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div style="display: flex; flex-wrap: wrap; padding: 16px;">
                    ${labels}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-info to-info/80 text-info-foreground p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Barcode className="w-6 h-6" />
                            طباعة الباركود
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-card/20 rounded-lg transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* معاينة الباركود */}
                <div className="p-6">
                    <div className="bg-muted rounded-xl p-6 border-2 border-dashed border-border text-center">
                        <div className="font-bold text-foreground mb-3">{drugName}</div>
                        <div className="flex justify-center gap-px mb-2">
                            {pattern.map((bar, index) => (
                                <div
                                    key={index}
                                    className={`h-12 bg-black ${bar === "thick" ? "w-1" : "w-px"}`}
                                />
                            ))}
                        </div>
                        <div className="font-mono text-sm text-muted-foreground mb-2">{barcode}</div>
                        <div className="text-xl font-bold text-success">{price.toFixed(2)}</div>
                    </div>

                    {/* عدد النسخ */}
                    <div className="mt-6">
                        <label className="block text-sm font-bold text-foreground mb-2">
                            عدد الملصقات
                        </label>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-10 h-10 rounded-lg bg-muted hover:bg-muted flex items-center justify-center font-bold text-foreground"
                            >
                                -
                            </button>
                            <input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-20 text-center rounded-lg border border-border px-4 py-2 font-bold"
                            />
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                className="w-10 h-10 rounded-lg bg-muted hover:bg-muted flex items-center justify-center font-bold text-foreground"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* أزرار الطباعة الشائعة */}
                    <div className="flex gap-2 mt-4">
                        {[1, 5, 10, 20].map(num => (
                            <button
                                key={num}
                                onClick={() => setQuantity(num)}
                                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${quantity === num
                                        ? "bg-primary/10 text-primary border border-primary/30"
                                        : "bg-muted text-muted-foreground hover:bg-muted"
                                    }`}
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-muted px-6 py-4 flex gap-3">
                    <button
                        onClick={handlePrint}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-lg transition-all"
                    >
                        <Printer className="w-5 h-5" />
                        طباعة {quantity} ملصق
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-3 bg-muted hover:bg-muted text-foreground font-bold rounded-lg transition-colors"
                    >
                        إلغاء
                    </button>
                </div>
            </div>
        </div>
    );
}
