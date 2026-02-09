import { forwardRef } from 'react';

interface InvoiceItem {
    name: string;
    quantity: number;
    price: number;
}

interface InvoiceData {
    items: InvoiceItem[];
    total: number;
    date: Date;
    invoiceNumber: string;
}

// تنسيق الدينار العراقي
const formatIQD = (amount: number) => {
    return new Intl.NumberFormat('ar-IQ', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount) + ' د.ع';
};

const InvoicePrint = forwardRef<HTMLDivElement, InvoiceData>(
    ({ items, total, date, invoiceNumber }, ref) => {
        return (
            <div
                ref={ref}
                dir="rtl"
                className="invoice-print bg-white text-black p-4 font-mono text-sm"
                style={{
                    width: '80mm',
                    maxWidth: '80mm',
                    fontFamily: 'Cairo, monospace',
                }}
            >
                {/* Header */}
                <div className="text-center mb-4 border-b-2 border-dashed border-gray-400 pb-4">
                    <div className="text-2xl mb-1">💊</div>
                    <h1 className="text-lg font-bold">صيدلية فاراماس</h1>
                    <p className="text-xs text-gray-600">نظام إدارة الصيدليات</p>
                </div>

                {/* Invoice Info */}
                <div className="mb-4 text-xs border-b border-dashed border-gray-300 pb-2">
                    <div className="flex justify-between">
                        <span>رقم الفاتورة:</span>
                        <span className="font-bold">{invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>التاريخ:</span>
                        <span>{date.toLocaleDateString('ar-IQ')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>الوقت:</span>
                        <span>{date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </div>

                {/* Items Header */}
                <div className="grid grid-cols-12 gap-1 text-xs font-bold border-b border-gray-400 pb-1 mb-2">
                    <div className="col-span-5">الصنف</div>
                    <div className="col-span-2 text-center">الكمية</div>
                    <div className="col-span-2 text-center">السعر</div>
                    <div className="col-span-3 text-left">المجموع</div>
                </div>

                {/* Items */}
                <div className="mb-4">
                    {items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-1 text-xs py-1 border-b border-dotted border-gray-200">
                            <div className="col-span-5 truncate">{item.name}</div>
                            <div className="col-span-2 text-center">{item.quantity}</div>
                            <div className="col-span-2 text-center">{item.price.toLocaleString()}</div>
                            <div className="col-span-3 text-left font-medium">
                                {(item.quantity * item.price).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div className="border-t-2 border-dashed border-gray-400 pt-2">
                    <div className="flex justify-between text-sm mb-1">
                        <span>عدد الأصناف:</span>
                        <span>{items.length}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                        <span>إجمالي العناصر:</span>
                        <span>{items.reduce((acc, item) => acc + item.quantity, 0)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t border-gray-400">
                        <span>الإجمالي:</span>
                        <span>{formatIQD(total)}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-6 pt-4 border-t-2 border-dashed border-gray-400">
                    <p className="text-xs text-gray-600 mb-1">شكراً لزيارتكم</p>
                    <p className="text-xs text-gray-500">نتمنى لكم الشفاء العاجل</p>
                    <div className="mt-2 text-xs text-gray-400">
                        ─────────────────
                    </div>
                </div>

                {/* Print Styles */}
                <style>{`
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        .invoice-print, .invoice-print * {
                            visibility: visible;
                        }
                        .invoice-print {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 80mm !important;
                            padding: 5mm !important;
                        }
                        @page {
                            size: 80mm auto;
                            margin: 0;
                        }
                    }
                `}</style>
            </div>
        );
    }
);

InvoicePrint.displayName = 'InvoicePrint';

export default InvoicePrint;
