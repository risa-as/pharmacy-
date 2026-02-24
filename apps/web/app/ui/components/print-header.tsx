import { getCompanySettings } from "@/app/lib/actions/settings";
import Image from "next/image";

export default async function PrintHeader() {
    const settings = await getCompanySettings();

    if (!settings) return null;

    return (
        <div className="hidden print:flex flex-col items-center justify-center mb-8 border-b pb-4">
            {settings.logoUrl && (
                <div className="relative w-24 h-24 mb-2">
                    {/* Use standard img for print reliability or next/image with configured domain */}
                    <img src={settings.logoUrl} alt="Logo" className="object-contain w-full h-full" />
                </div>
            )}
            <h1 className="text-3xl font-bold mb-2">{settings.name}</h1>
            <div className="flex gap-4 text-sm text-muted-foreground">
                {settings.phone && <span>{settings.phone}</span>}
                {settings.address && <span>{settings.address}</span>}
            </div>
        </div>
    );
}
