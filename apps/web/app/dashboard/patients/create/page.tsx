import CreatePatientForm from "@/app/ui/patients/create-form";
import { Users } from "lucide-react";

export default function CreatePatientPage() {
    return (
        <main className="mx-auto max-w-2xl" suppressHydrationWarning>
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                    <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">إضافة مريض جديد</h1>
                    <p className="text-sm text-gray-500">سجل بيانات المريض للمتابعة</p>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <CreatePatientForm />
            </div>
        </main>
    );
}
