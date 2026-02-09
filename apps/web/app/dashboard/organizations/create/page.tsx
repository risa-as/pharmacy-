import Form from "@/app/ui/organizations/create-form";
import Breadcrumbs from "@/app/ui/dashboard/breadcrumbs";

export default function Page() {
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
