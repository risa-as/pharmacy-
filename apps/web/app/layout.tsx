import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { cn } from "@faramace/ui";

const cairo = Cairo({ subsets: ["arabic"] });

export const metadata: Metadata = {
  title: "Faramace Cloud | فاراماس السحابي",
  description: "Advanced Pharmacy Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={cn(cairo.className, "bg-gray-50 text-gray-900 antialiased")} suppressHydrationWarning>
        <div suppressHydrationWarning>
          {children}
        </div>
      </body>
    </html>
  );
}
