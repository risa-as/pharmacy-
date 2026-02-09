import { notFound } from "next/navigation";
import EditForm from "@/app/ui/patients/edit-form";
import { getPatientById } from "@/app/lib/actions/patient";
import { Button } from "@faramace/ui";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

export default async function Page({ params }: { params: { id: string } }) {
    const patient = await getPatientById(params.id);

    if (!patient) {
        notFound();
    }

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/patients">
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                        <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">تعديل بيانات المريض</h1>
                        <p className="text-sm text-gray-500">{patient.name}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <EditForm patient={patient} />
            </div>
        </div>
    );
}
