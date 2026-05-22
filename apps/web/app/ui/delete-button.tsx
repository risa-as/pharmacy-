"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@faramace/ui";

interface DeleteButtonProps {
    action?: (formData: FormData) => Promise<any>;
    onConfirm?: () => void;
    description: string;
    className?: string;
}

export function DeleteButton({ action, onConfirm, description, className }: DeleteButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            if (action) {
                const formData = new FormData();
                const result = await action(formData);
                if (result?.message) {
                    toast.error(result.message);
                } else {
                    toast.success(`تم حذف ${description} بنجاح`);
                }
            } else if (onConfirm) {
                onConfirm();
                toast.success(`تم حذف ${description} بنجاح`);
            }
            setIsOpen(false);
        } catch (error) {
            toast.error("حدث خطأ أثناء الحذف");
            console.error(error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={cn(
                    "rounded-md border p-2 hover:bg-destructive/10 transition-colors hover:text-destructive",
                    className
                )}
                title="حذف"
                type="button"
            >
                <Trash2 className="w-4 h-4" />
            </button>

            {isOpen && mounted && createPortal(
                <div
                    className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => !isDeleting && setIsOpen(false)}
                >
                    {/* Modal */}
                    <div
                        className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 space-y-6 animate-in zoom-in-95 duration-200 border border-border"
                        dir="rtl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-destructive" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-foreground">تأكيد الحذف</h3>
                                <p className="text-muted-foreground">
                                    هل أنت متأكد من حذف {description}؟ لا يمكن التراجع عن هذا الإجراء.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                disabled={isDeleting}
                                onClick={handleDelete}
                                className="flex-1 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg font-bold hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        جاري الحذف...
                                    </>
                                ) : (
                                    "نعم، احذف"
                                )}
                            </button>
                            <button
                                disabled={isDeleting}
                                onClick={() => setIsOpen(false)}
                                className="flex-1 bg-muted text-foreground px-4 py-2 rounded-lg font-bold hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
