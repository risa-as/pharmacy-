import EditForm from "@/app/ui/drugs/edit-form";
import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";


const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default async function Page({ params }: { params: { id: string } }) {
    const id = params.id;

    const drug = await prisma.globalDrug.findUnique({
        where: { id },
    });

    if (!drug) {
        notFound();
    }

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/drugs" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <h1 className="text-2xl font-bold font-cairo text-foreground">تعديل الدواء</h1>
            </div>
            <EditForm drug={drug} />
        </div>
    );
}
