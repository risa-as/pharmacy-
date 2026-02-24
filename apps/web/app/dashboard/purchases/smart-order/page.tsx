import { auth } from "@/auth";
import SmartOrderClient from "./smart-order-client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function SmartOrderPage() {
    const session = await auth();
    const branchId = session?.user?.branchId;
    const isAdmin = session?.user?.role === "ADMIN";

    if (!branchId) {
        return <div className="p-8 text-center text-destructive">حدث خطأ: لم يتم العثور على الفرع الخاص بك. يرجى تسجيل الدخول مجدداً.</div>;
    }

    let branches: { id: string; name: string }[] = [];
    if (isAdmin) {
        branches = await prisma.branch.findMany({
            select: { id: true, name: true },
            orderBy: { name: 'asc' }
        });
    }

    return <SmartOrderClient branchId={branchId} isAdmin={isAdmin} branches={branches} />;
}
