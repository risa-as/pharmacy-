import { Smartphone } from "lucide-react";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export default function ZainCashModal({ isOpen, onClose }: Props) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
            <div className="bg-card rounded-2xl p-8 max-w-sm w-full text-center space-y-6 animate-slideUp">
                <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-purple-100 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Smartphone className="w-10 h-10 text-purple-600" />
                </div>
                <div>
                    <h3 className="text-xl font-bold mb-2">في انتظار الدفع...</h3>
                    <p className="text-muted-foreground text-sm">
                        يرجى إتمام عملية الدفع في النافذة المنبثقة.<br />
                        سيتم تحديث الحالة تلقائياً.
                    </p>
                </div>
                <div className="flex justify-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <button onClick={onClose} className="text-destructive text-sm hover:underline font-medium">
                    إلغاء العملية
                </button>
            </div>
        </div>
    );
}
