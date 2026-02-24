import CreateInsuranceForm from "@/app/ui/insurance/create-form";
import { Building2 } from "lucide-react";

export default function CreateInsurancePage() {
    return (
        <main className="mx-auto max-w-2xl" suppressHydrationWarning>
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">إضافة شركة تأمين</h1>
                    <p className="text-sm text-muted-foreground">سجل شركة تأمين جديدة</p>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <CreateInsuranceForm />
            </div>
        </main>
    );
}
