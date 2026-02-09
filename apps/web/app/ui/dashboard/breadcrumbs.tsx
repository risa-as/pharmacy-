import Link from "next/link";
import { cn } from "@faramace/ui";

interface Breadcrumb {
    label: string;
    href: string;
    active?: boolean;
}

export default function Breadcrumbs({
    breadcrumbs,
}: {
    breadcrumbs: Breadcrumb[];
}) {
    return (
        <nav aria-label="Breadcrumb" className="mb-6 block">
            <ol className={cn("flex text-xl md:text-2xl font-cairo")}>
                {breadcrumbs.map((breadcrumb, index) => (
                    <li
                        key={breadcrumb.href}
                        aria-current={breadcrumb.active}
                        className={cn(
                            breadcrumb.active ? "text-gray-900 font-bold" : "text-gray-500",
                        )}
                    >
                        <Link href={breadcrumb.href}>{breadcrumb.label}</Link>
                        {index < breadcrumbs.length - 1 ? (
                            <span className="mx-3 inline-block rtl:rotate-180">/</span>
                        ) : null}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
