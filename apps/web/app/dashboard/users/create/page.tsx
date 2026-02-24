import { PrismaClient } from "@prisma/client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CreateUserForm from "@/app/ui/users/create-form";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getBranches() {
    return await prisma.branch.findMany({
        orderBy: { name: 'asc' },
    });
}

export default async function CreateUserPage() {
    const branches = await getBranches();

    return (
        <div className="w-full max-w-2xl mx-auto" suppressHydrationWarning>
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard/users" className="inline-flex items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <h1 className="text-2xl font-bold font-cairo text-foreground">إضافة مستخدم جديد</h1>
            </div>

            <div className="rounded-xl bg-card border border-border shadow-sm p-6">
                <CreateUserForm branches={branches} />
            </div>
        </div>
    );
}
