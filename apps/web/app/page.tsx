import Link from "next/link";
import { Pill, ArrowLeft, Shield, Zap, BarChart3, Globe } from "lucide-react";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <main className="relative min-h-screen overflow-hidden" dir="rtl">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-auth-from)] via-[var(--gradient-auth-via)] to-[var(--gradient-auth-to)]">
        <div className="absolute top-[10%] right-[15%] w-96 h-96 rounded-full bg-blue-500/8 blur-3xl animate-pulse" />
        <div className="absolute bottom-[15%] left-[10%] w-[500px] h-[500px] rounded-full bg-indigo-500/6 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-[50%] left-[50%] w-72 h-72 rounded-full bg-violet-500/8 blur-3xl animate-pulse" style={{ animationDelay: "4s" }} />
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }} />
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center min-h-screen px-6 py-16">
        {/* Logo */}
        <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 mb-8 shadow-2xl">
          <Pill className="w-10 h-10 text-white" />
        </div>

        {/* Title */}
        <h1 className="text-6xl md:text-7xl font-black text-white tracking-tight mb-3 text-center" style={{ textShadow: "0 0 80px rgba(129,140,248,0.3)" }}>
          فاراماس
        </h1>
        <div className="h-0.5 w-20 rounded-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent mb-4" />
        <p className="text-xl text-white/40 font-medium mb-12 text-center">
          نظام إدارة الصيدليات السحابي المتكامل
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap justify-center gap-3 mb-12 max-w-xl">
          {[
            { icon: Shield, text: "آمن ومشفّر" },
            { icon: Zap, text: "سريع وخفيف" },
            { icon: BarChart3, text: "تقارير متقدمة" },
            { icon: Globe, text: "يعمل من أي مكان" },
          ].map((item: any, i: any) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-white/50 text-sm font-medium"
            >
              <item.icon className="w-4 h-4 text-indigo-300" />
              {item.text}
            </div>
          ))}
        </div>

        {/* Single Smart CTA */}
        <Link
          href={isLoggedIn ? "/dashboard" : "/login"}
          className="flex items-center justify-center gap-2 px-10 py-4 bg-gradient-to-l from-primary to-primary/80 text-primary-foreground font-bold text-lg rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {isLoggedIn ? "الذهاب للوحة التحكم" : "تسجيل الدخول"}
          <ArrowLeft className="w-5 h-5" />
        </Link>

        {/* Footer */}
        <p className="absolute bottom-6 text-[11px] text-white/20 font-medium">
          Faramace Cloud System v1.0
        </p>
      </div>
    </main>
  );
}
