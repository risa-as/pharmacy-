"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Scan, Search } from "lucide-react";
import { toast } from "sonner";
import AddBatchModal from "./add-batch-modal";
import AddToInventoryModal from "./add-to-inventory-modal";
import CreateDrugModal from "./create-drug-modal";

interface QuickBarcodeEntryProps {
    branches: { id: string; name: string }[];
}

export default function QuickBarcodeEntry({ branches }: QuickBarcodeEntryProps) {
    const [barcode, setBarcode] = useState("");
    const [isChecking, setIsChecking] = useState(false);

    // Modal States
    const [showAddBatch, setShowAddBatch] = useState(false);
    const [showCreateDrug, setShowCreateDrug] = useState(false);
    const [showAddToInventory, setShowAddToInventory] = useState(false);

    // Data for Modals
    const [foundDrug, setFoundDrug] = useState<any>(null);
    const [foundInventoryId, setFoundInventoryId] = useState<string | null>(null);
    const [foundInventoryPrice, setFoundInventoryPrice] = useState<number | null>(null);
    const [lastScannedBarcode, setLastScannedBarcode] = useState("");

    const inputRef = useRef<HTMLInputElement>(null);

    const focusInput = () => {
        inputRef.current?.focus();
    };

    const resetModals = () => {
        setShowAddBatch(false);
        setShowCreateDrug(false);
        setShowAddToInventory(false);
    };

    useEffect(() => {
        focusInput();
    }, []);

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        const code = barcode.trim();
        if (!code || isChecking) return;
        await checkBarcode(code);
    };

    const checkBarcode = async (code: string) => {
        setIsChecking(true);
        resetModals();
        setFoundDrug(null);
        setFoundInventoryId(null);
        setFoundInventoryPrice(null);

        try {
            const res = await fetch("/api/inventory/check-barcode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ barcode: code }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.message || "حدث خطأ أثناء فحص الباركود");
            }

            setLastScannedBarcode(code);

            if (data.exists && data.drug) {
                setFoundDrug(data.drug);

                if (data.inventory?.id) {
                    setFoundInventoryId(data.inventory.id);
                    setFoundInventoryPrice(typeof data.inventory.price === "number" ? data.inventory.price : null);
                    setShowAddBatch(true);
                    toast.success("تم العثور على الدواء. يمكنك إضافة دفعة جديدة.");
                } else {
                    setShowAddToInventory(true);
                    toast.info("الدواء موجود في النظام لكنه غير موجود في المخزون.");
                }
                return;
            }

            setShowCreateDrug(true);
            toast.info("دواء جديد. يرجى إدخال بياناته.");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "حدث خطأ أثناء فحص الباركود";
            toast.error(message);
        } finally {
            setIsChecking(false);
            setBarcode("");
        }
    };

    return (
        <>
            <div className="w-full bg-card/50 p-4 rounded-xl shadow-sm border border-border mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg text-primary">
                        <Scan className="w-6 h-6" />
                    </div>

                    <div className="flex-1 relative">
                        <input
                            ref={inputRef}
                            type="text"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="امسح الباركود هنا (أو اضغط Enter)..."
                            className="w-full text-lg p-3 pl-12 border-2 border-border rounded-lg focus:border-primary focus:ring-4 focus:ring-ring/20 transition-all font-mono"
                            disabled={isChecking}
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {isChecking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        </div>
                    </div>
                </div>
            </div>

            {showAddBatch && foundInventoryId && foundDrug && (
                <AddBatchModal
                    inventoryId={foundInventoryId}
                    drugName={foundDrug.tradeName}
                    currentPrice={foundInventoryPrice}
                    onClose={() => {
                        setShowAddBatch(false);
                        focusInput();
                    }}
                />
            )}

            {showCreateDrug && (
                <CreateDrugModal
                    initialBarcode={lastScannedBarcode}
                    branches={branches}
                    onClose={() => {
                        setShowCreateDrug(false);
                        focusInput();
                    }}
                />
            )}

            {showAddToInventory && foundDrug && (
                <AddToInventoryModal
                    drug={foundDrug}
                    branches={branches}
                    onClose={() => {
                        setShowAddToInventory(false);
                        focusInput();
                    }}
                />
            )}
        </>
    );
}
