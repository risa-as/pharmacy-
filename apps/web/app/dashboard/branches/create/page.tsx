import Form from "@/app/ui/branches/create-form";
import { PrismaClient } from "@prisma/client";
import { Store } from "lucide-react";

const globalForPrisma = global as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

async function getOrganizations() {
  return await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: 'asc',
    },
  });
}

export default async function Page() {
  const organizations = await getOrganizations();

  return (
    <main className="mx-auto max-w-2xl" suppressHydrationWarning>
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
          <Store className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">إضافة فرع جديد</h1>
          <p className="text-sm text-gray-500">سجل فرع جديد للمنظمة</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <Form organizations={organizations} />
      </div>
    </main>
  );
}
