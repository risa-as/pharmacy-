"use client";

import { Package, TrendingUp } from "lucide-react";

interface Product {
    name: string;
    quantity: number;
    revenue: number;
}

interface TopProductsProps {
    products: Product[];
    title?: string;
}

export default function TopProducts({ products, title = "أفضل المنتجات مبيعاً" }: TopProductsProps) {
    const maxQuantity = Math.max(...products.map(p => p.quantity), 1);

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    {title}
                </h3>
            </div>

            <div className="space-y-4">
                {products.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p>لا توجد مبيعات</p>
                    </div>
                ) : (
                    products.map((product, index) => {
                        const widthPercent = (product.quantity / maxQuantity) * 100;
                        return (
                            <div key={index} className="relative">
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? "bg-yellow-100 text-yellow-700" :
                                                index === 1 ? "bg-gray-100 text-gray-700" :
                                                    index === 2 ? "bg-orange-100 text-orange-700" :
                                                        "bg-blue-50 text-blue-600"
                                            }`}>
                                            {index + 1}
                                        </span>
                                        <span className="font-medium text-gray-800 text-sm truncate max-w-[150px]">
                                            {product.name}
                                        </span>
                                    </div>
                                    <div className="text-left">
                                        <span className="text-sm font-bold text-gray-700">{product.quantity}</span>
                                        <span className="text-xs text-gray-400 mr-1">قطعة</span>
                                    </div>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${index === 0 ? "bg-gradient-to-r from-yellow-400 to-yellow-500" :
                                                index === 1 ? "bg-gradient-to-r from-gray-400 to-gray-500" :
                                                    index === 2 ? "bg-gradient-to-r from-orange-400 to-orange-500" :
                                                        "bg-gradient-to-r from-blue-400 to-blue-500"
                                            }`}
                                        style={{ width: `${widthPercent}%` }}
                                    />
                                </div>
                                <div className="text-xs text-green-600 font-medium mt-1">
                                    {product.revenue.toFixed(2)} ر.س
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
