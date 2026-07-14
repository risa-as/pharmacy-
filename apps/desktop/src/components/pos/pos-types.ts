export interface Product {
    id: string;
    name: string;
    scientificName?: string;
    origin?: string;
    price: number;
    costPrice?: number;
    stock: number;
    barcode: string;
    nearestExpiry?: string | null;
}

export interface CartItem extends Product {
    quantity: number;
    originalPrice?: number; // set only when price has been manually overridden
}


export interface Patient {
    id: string;
    name: string;
    phone: string;
    loyaltyAccount?: {
        totalPoints: number;
        tier: string;
    };
}

export interface ShiftSummary {
    startTime: string | Date;
    safeName: string;
    salesCount: number;
    salesTotalAmount: number;
    cashSalesCount: number;
    cashSalesTotal: number;
    cardSalesCount: number;
    cardSalesTotal: number;
    creditSalesCount: number;
    creditSalesTotal: number;
    returnsTotal: number;
    startingCash: number;
    expectedCash: number;
}

export interface HeldInvoice {
    id: string;
    label: string;            // ملاحظة/اسم اختياري للتمييز بين الفواتير المعلّقة
    createdAt: string;        // ISO timestamp
    cart: CartItem[];
    patient: Patient | null;
    manualDiscount: number;
    isRedeemingLoyalty: boolean;
    // لقطات للعرض السريع دون إعادة حساب
    subTotal: number;
    itemCount: number;
}

export interface DrugInteraction {
    drug1: string;
    drug2: string;
    severity: string;
    description: string;
}

export interface SaleData {
    items: { name: string; quantity: number; price: number; originalPrice?: number }[];
    total: number;
    invoiceNumber: string;
    date: Date;
    patientName?: string;
    patientPhone?: string;
    settings?: any;
    pointsEarned?: number;
    discount?: number;
    pointsRedeemed?: number;
    isCredit?: boolean;
}
