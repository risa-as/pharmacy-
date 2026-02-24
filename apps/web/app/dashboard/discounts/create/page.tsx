import CreateDiscountForm from "@/app/ui/discounts/create-form";

import Link from "next/link";
import { ArrowRight, Tag } from "lucide-react";

export default function Page() {
    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/discounts" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Tag className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">إنشاء عرض جديد</h1>
                        <p className="text-sm text-muted-foreground">خصم أو عرض ترويجي</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <CreateDiscountForm />
            </div>
        </div>
    );
}
