import LoginForm from "@/app/ui/login-form";
import { Pill, Shield, BarChart3, Zap } from "lucide-react";

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
                    <div className="mb-8">
                        <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 mb-6 mx-auto">
                            <Pill className="w-10 h-10 text-white" />
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
                            { icon: Pill, text: "إدارة أدوية شاملة" },
                            { icon: Shield, text: "أمان وتشفير عالي" },
                            { icon: BarChart3, text: "تقارير متقدمة" },
                            { icon: Zap, text: "سرعة فائقة" },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10"
                            >
                                <item.icon className="w-5 h-5 text-indigo-300 shrink-0" />
                                <span className="text-sm text-white/70 font-medium">{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Left Side — Login Form */}
            <div className="flex-1 flex items-center justify-center bg-background p-6">
                <div className="w-full max-w-md space-y-8">
                    {/* Mobile Header (hidden on desktop) */}
                    <div className="lg:hidden flex flex-col items-center text-center space-y-3">
                        <div className="w-16 h-16 bg-gradient-to-tr from-primary to-primary/80 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25">
                            <Pill className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-3xl font-black text-foreground">فاراماس</h1>
                        <p className="text-sm text-muted-foreground">نظام إدارة الصيدليات الذكي</p>
                    </div>

                    {/* Form Card */}
                    <div className="bg-card rounded-2xl p-8 shadow-xl shadow-black/5 ring-1 ring-border">
                        <LoginForm />
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs text-muted-foreground">
                        بالمتابعة، أنت توافق على{" "}
                        <a href="#" className="underline hover:text-primary transition-colors">شروط الخدمة</a>{" "}
                        و{" "}
                        <a href="#" className="underline hover:text-primary transition-colors">سياسة الخصوصية</a>
                    </p>
                </div>
            </div>
        </main>
    );
}
