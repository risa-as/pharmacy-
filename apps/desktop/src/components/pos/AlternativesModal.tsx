import { Database } from "lucide-react";
import { formatIQD } from "./pos-utils";
import type { Product } from "./pos-types";

interface Props {
    isOpen: boolean;
    product: Product | null;
    alternatives: Product[];
    onClose: () => void;
    onSelect: (alt: Product) => void;
}

export default function AlternativesModal({ isOpen, product, alternatives, onClose, onSelect }: Props) {
    if (!isOpen || !product) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full p-6 mx-4 animate-scaleIn border border-border">
                <div className="flex flex-col items-center text-center mb-6">
                    <div className="w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center mb-3 text-warning">
                        <Database className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">المنتج غير متوفر!</h3>
                    <p className="text-muted-foreground mt-1">
                        الكمية من
                        <span className="font-bold text-foreground mx-1">{product.name}</span>
                        نفدت. إليك البدائل المتاحة بنفس الاسم العلمي ({product.scientificName}):
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto p-2 mb-6 bg-muted/50 rounded-xl border border-border">
                    {alternatives.map((alt) => (
                        <div key={alt.id} className="flex justify-between items-center bg-card p-3 rounded-lg shadow-sm border border-border hover:border-primary/40 transition-colors">
                            <div>
                                <div className="font-bold text-foreground">{alt.name}</div>
                                <div className="text-xs text-muted-foreground flex gap-2">
                                    <span>{alt.origin}</span>
                                    <span>•</span>
                                    <span>{alt.barcode}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="font-bold text-primary">{formatIQD(alt.price)}</div>
                                    <div className="text-xs text-success font-medium">الرصيد: {alt.stock}</div>
                                </div>
                                <button
                                    onClick={() => onSelect(alt)}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                                >
                                    اختيار
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-muted hover:bg-muted/80 text-foreground font-bold py-3 rounded-xl transition-all"
                >
                    إلغاء
                </button>
            </div>
        </div>
    );
}
