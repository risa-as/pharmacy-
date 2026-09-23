import Form from "@/app/ui/organizations/create-form";
import Breadcrumbs from "@/app/ui/dashboard/breadcrumbs";
import { getTenantContext } from '@/app/lib/tenant-utils';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';

export default async function Page() {
    const ctx = await getTenantContext();
    if (ctx instanceof NextResponse) redirect('/login');
    if (ctx.user.role !== 'SUPER_ADMIN') redirect('/dashboard?denied=1');
    return (
        <main>
            <Breadcrumbs
                breadcrumbs={[
                    { label: "المنظمات", href: "/dashboard/organizations" },
                    {
                        label: "إضافة منظمة",
                        href: "/dashboard/organizations/create",
                        active: true,
                    },
                ]}
            />
            <Form />
        </main>
    );
}
