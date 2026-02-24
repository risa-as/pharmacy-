import Form from "@/app/ui/drugs/create-form";
import { Pill } from "lucide-react";

export default function Page() {
    return (
        <main className="mx-auto max-w-2xl" suppressHydrationWarning>
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                    <Pill className="h-6 w-6 text-success" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إضافة دواء جديد</h1>
                    <p className="text-sm text-muted-foreground">سجل دواء جديد في قاعدة البيانات</p>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <Form />
            </div>
        </main>
    );
}
