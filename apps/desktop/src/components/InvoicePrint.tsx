import { forwardRef } from 'react';

interface InvoiceItem {
    name: string;
    quantity: number;
    price: number;
    originalPrice?: number;
}

interface InvoiceData {
    items: InvoiceItem[];
    total: number;
    date: Date;
    invoiceNumber: string;
    patientName?: string;
    patientPhone?: string; // Added phone
    settings?: any;
    pointsEarned?: number;
}

// تنسيق الدينار العراقي بالأرقام الإنجليزية
const formatIQD = (amount: number) => {
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);

    return formatted + ' د.ع';
};

const InvoicePrint = forwardRef<HTMLDivElement, InvoiceData>(
    ({ items, total, date, invoiceNumber, patientName, patientPhone, settings, pointsEarned }, ref) => {
        // تحويل أرقام الفاتورة
        const localizedInvoiceNumber = invoiceNumber.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);

        return (
            <div
                ref={ref}
                dir="rtl"
                className="invoice-print bg-white text-black p-4 font-mono text-sm leading-relaxed"
                style={{
                    width: '80mm',
                    maxWidth: '80mm',
                    fontFamily: 'Cairo, monospace',
                }}
            >
                {/* Header */}
                <div className="text-center mb-4 border-b-2 border-dashed border-gray-400 pb-4">

                    {settings?.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain grayscale" />
                    ) : (
                        <div className="text-3xl mb-2">💊</div>
                    )}
                    <h1 className="text-xl font-bold mb-1">{settings?.name || "صيدلية فاراماس"}</h1>
                    <p className="text-xs text-gray-600 font-semibold">{settings?.address || "نظام إدارة الصيدليات"}</p>
                    {settings?.phone && <p className="text-xs text-gray-600" dir="ltr">{settings.phone}</p>}

                    {/* Patient Info */}
                    {patientName && (
                        <div className="mt-2 text-xs font-bold border-t border-dotted border-gray-300 pt-1">
                            <p>العميل: {patientName}</p>
                            {patientPhone && <p dir="ltr">{patientPhone}</p>}
                        </div>
                    )}
                </div>

                {/* Invoice Info */}
                <div className="mb-4 text-xs font-semibold border-b border-dashed border-gray-300 pb-2 space-y-1">
                    <div className="flex justify-between">
                        <span>رقم الفاتورة:</span>
                        <span className="font-bold font-sans" dir="ltr">{localizedInvoiceNumber}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>التاريخ:</span>
                        <span>{date.toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>الوقت:</span>
                        <span>{date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace('AM', 'ص').replace('PM', 'م')}</span>
                    </div>
                </div>

                {/* Items Header */}
                <div className="grid grid-cols-12 gap-1 text-[10px] font-bold border-b border-gray-800 pb-1 mb-2">
                    <div className="col-span-5 text-right">الصنف</div>
                    <div className="col-span-2 text-center">الكمية</div>
                    <div className="col-span-2 text-center">السعر</div>
                    <div className="col-span-3 text-left">المجموع</div>
                </div>

                {/* Items */}
                <div className="mb-4">
                    {items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-1 text-[10px] py-1 border-b border-gray-200 items-start">
                            <div className="col-span-5 break-words font-bold leading-tight">
                                {item.name}
                                {item.originalPrice !== undefined && (
                                    <span className="mr-1 px-0.5 rounded text-[8px] font-black bg-amber-100 text-amber-700 border border-amber-300">✏ سعر معدّل</span>
                                )}
                            </div>
                            <div className="col-span-2 text-center pt-0.5">{item.quantity}</div>
                            <div className="col-span-2 text-center pt-0.5">
                                {item.originalPrice !== undefined && (
                                    <span className="line-through text-gray-400 ml-1">{item.originalPrice.toLocaleString('en-US')}</span>
                                )}
                                {item.price.toLocaleString('en-US')}
                            </div>
                            <div className="col-span-3 text-left font-bold pt-0.5">
                                {(item.quantity * item.price).toLocaleString('en-US')}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div className="border-t-2 border-dashed border-gray-400 pt-2 space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                        <span>عدد الأصناف:</span>
                        <span>{items.length}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                        <span>إجمالي العناصر:</span>
                        <span>{items.reduce((acc, item) => acc + item.quantity, 0)}</span>
                    </div>
                    <div className="text-xl font-bold text-center border-t border-dotted border-gray-400 mt-2 pt-2">
                        {formatIQD(total)}
                    </div>
                </div>
                {/* Loyalty Points */}
                {settings?.loyaltyEnabled && (pointsEarned ? pointsEarned : 0) > 0 && (
                    <div className="flex justify-between text-xs font-bold mt-1 text-gray-600 border-t border-dotted border-gray-400 pt-1">
                        <span>نقاط مكتسبة:</span>
                        <span>{pointsEarned || 0} نقطة</span>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center mt-6 pt-4 border-t-2 border-dashed border-gray-400">
                    <p className="text-sm font-bold mb-1">شكراً لزيارتكم</p>
                    <p className="text-xs font-medium text-gray-500">نتمنى لكم الشفاء العاجل</p>
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
