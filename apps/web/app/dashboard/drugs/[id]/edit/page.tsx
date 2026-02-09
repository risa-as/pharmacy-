import EditForm from "@/app/ui/drugs/edit-form";
import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@faramace/ui";

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
                <Button asChild variant="outline" size="icon">
                    <Link href="/dashboard/drugs">
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold font-cairo text-gray-800">تعديل الدواء</h1>
            </div>
            <EditForm drug={drug} />
        </div>
    );
}
