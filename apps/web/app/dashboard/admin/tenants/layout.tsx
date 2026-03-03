import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    const role = session?.user?.role;
    if (role !== 'SUPER_ADMIN') {
        redirect('/dashboard');
    }
    return <main>{children}</main>;
}
