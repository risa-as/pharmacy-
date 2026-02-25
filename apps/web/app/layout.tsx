import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { cn } from "@faramace/ui";
import { Toaster } from "sonner";
import NextTopLoader from 'nextjs-toploader';

const cairo = Cairo({ subsets: ["arabic"] });

export const metadata: Metadata = {
  title: "Faramace Cloud | فاراماس السحابي",
  description: "Advanced Pharmacy Management System",
};

import { Providers } from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      {/* Anti-flash script: runs before CSS to set dark class from localStorage */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('faramace-theme');var p=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s===null&&p)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={cn(cairo.className, "bg-background text-foreground antialiased")} suppressHydrationWarning>
        <Providers>
          <NextTopLoader
            color="#2563eb"
            initialPosition={0.08}
            crawlSpeed={200}
            height={3}
            crawl={true}
            showSpinner={false}
            easing="ease"
            speed={200}
            shadow="0 0 10px #2563eb,0 0 5px #2563eb"
          />
          <div suppressHydrationWarning>
            {children}
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
