import LoginForm from "@/app/ui/login-form";
import { Shield, BarChart3, Zap, Pill } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
    return (
        <main className="flex min-h-screen" dir="rtl">
            {/* Right Side — Brand Panel */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-auth-from)] via-[var(--gradient-auth-via)] to-[var(--gradient-auth-to)]">
                    {/* Floating Orbs */}
                    <div className="absolute top-[15%] right-[20%] w-72 h-72 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
                    <div className="absolute bottom-[20%] left-[10%] w-96 h-96 rounded-full bg-indigo-500/8 blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
                    <div className="absolute top-[60%] right-[60%] w-48 h-48 rounded-full bg-violet-500/10 blur-3xl animate-pulse" style={{ animationDelay: "4s" }} />
                    {/* Grid Pattern */}
                    <div className="absolute inset-0" style={{
                        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
                        backgroundSize: "40px 40px",
                    }} />
                </div>

                {/* Content */}
                <div className="relative flex flex-col items-center justify-center w-full p-12 text-white">
                    {/* Logo Area */}
                    <div className="mb-8 flex flex-col items-center">
                        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/10 backdrop-blur-md border border-white/20 mb-6 shadow-2xl shadow-black/30">
                            <Image
                                src="/logo.png"
                                alt="Faramace Logo"
                                width={96}
                                height={96}
                                className="w-full h-full object-cover"
                                priority
                            />
                        </div>
                        <h1 className="text-5xl font-black text-center tracking-tight mb-3" style={{ textShadow: "0 0 60px rgba(129,140,248,0.3)" }}>
                            فاراماس
                        </h1>
                        <div className="h-0.5 w-16 mx-auto rounded-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent mb-4" />
                        <p className="text-lg text-white/50 text-center font-medium">
                            مستقبل إدارة الصيدليات
                        </p>
                    </div>

                    {/* Features */}
                    <div className="grid grid-cols-2 gap-4 max-w-sm w-full">
                        {[
                            { icon: Pill,     text: "إدارة أدوية شاملة" },
                            { icon: Shield,   text: "أمان وتشفير عالي" },
                            { icon: BarChart3, text: "تقارير متقدمة" },
                            { icon: Zap,      text: "سرعة فائقة" },
                        ].map((item: any, i: any) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
                                <item.icon className="w-5 h-5 text-indigo-300 shrink-0" />
                                <span className="text-sm text-white/70 font-medium">{item.text}</span>
                            </div>
                        ))}
                    </div>

                    {/* Powered by — bottom of brand panel */}
                    <p className="absolute bottom-6 text-[11px] text-white/30 tracking-wide select-none">
                        طُوِّر بواسطة{" "}
                        <span className="font-bold text-white/50">Risa02</span>
                    </p>
                </div>
            </div>

            {/* Left Side — Login Form */}
            <div className="flex-1 flex flex-col items-center justify-center bg-background p-6">
                <div className="w-full max-w-md space-y-6">
                    {/* Mobile Header */}
                    <div className="lg:hidden flex flex-col items-center text-center space-y-3">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-primary/25">
                            <Image
                                src="/logo.png"
                                alt="Faramace Logo"
                                width={64}
                                height={64}
                                className="w-full h-full object-cover"
                                priority
                            />
                        </div>
                        <h1 className="text-3xl font-black text-foreground">فاراماس</h1>
                        <p className="text-sm text-muted-foreground">نظام إدارة الصيدليات الذكي</p>
                    </div>

                    {/* Form Card */}
                    <div className="bg-card rounded-2xl p-8 shadow-xl shadow-black/5 ring-1 ring-border">
                        <LoginForm />
                    </div>

                    {/* Footer links */}
                    <p className="text-center text-xs text-muted-foreground">
                        بالمتابعة، أنت توافق على{" "}
                        <a href="#" className="underline hover:text-primary transition-colors">شروط الخدمة</a>{" "}
                        و{" "}
                        <a href="#" className="underline hover:text-primary transition-colors">سياسة الخصوصية</a>
                    </p>

                    {/* Powered by — visible on mobile only */}
                    <p className="lg:hidden text-center text-[11px] text-muted-foreground/50 select-none">
                        طُوِّر بواسطة <span className="font-semibold text-muted-foreground/70">Risa02</span>
                    </p>
                </div>
            </div>
        </main>
    );
}
