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
    creditSalesCount: number;
    creditSalesTotal: number;
    startingCash: number;
    expectedCash: number;
}

export interface DrugInteraction {
    drug1: string;
    drug2: string;
    severity: string;
    description: string;
}

export interface SaleData {
    items: { name: string; quantity: number; price: number }[];
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
