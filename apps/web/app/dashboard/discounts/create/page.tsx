import CreateDiscountForm from "@/app/ui/discounts/create-form";
import { Button } from "@faramace/ui";
import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";

export default function Page() {
    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/discounts">
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                        <Tag className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">إنشاء عرض جديد</h1>
                        <p className="text-sm text-gray-500">خصم أو عرض ترويجي</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <CreateDiscountForm />
            </div>
        </div>
    );
}
