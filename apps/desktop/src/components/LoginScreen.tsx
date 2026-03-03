import { useState, useEffect } from 'react';
import { ArrowLeft, Pill, Shield, Zap, BarChart3, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
    onLogin: (user: any) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
    const [_users, setUsers] = useState<any[]>([]);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('get-users').then(setUsers);
        }
    }, []);

    const handleLogin = async () => {
        if (!window.ipcRenderer) return;
        setIsLoading(true);
        setError('');

        try {
            const result = await window.ipcRenderer.invoke('login', { email, password });
            if (result.success) {
                onLogin(result.user);
            } else {
                setError(result.error || 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
            }
        } catch (err) {
            setError('حدث خطأ في الاتصال بالنظام');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && email && password) {
            handleLogin();
        }
    };

    return (
        <div className="flex h-screen" dir="rtl">
            {/* Right Side — Brand Panel */}
            <div className={`w-[420px] relative overflow-hidden shrink-0 transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                {/* Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--gradient-auth-from)] via-[var(--gradient-auth-via)] to-[var(--gradient-auth-to)]">
                    {/* Floating Orbs */}
                    <div className="absolute top-[15%] right-[20%] w-48 h-48 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
                    <div className="absolute bottom-[25%] left-[10%] w-64 h-64 rounded-full bg-indigo-500/8 blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
                    <div className="absolute top-[55%] right-[50%] w-36 h-36 rounded-full bg-violet-500/10 blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />

                    {/* Grid Pattern */}
                    <div className="absolute inset-0" style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)',
                        backgroundSize: '32px 32px',
                    }} />
                </div>

                {/* Content */}
                <div className="relative flex flex-col items-center justify-center h-full p-8 text-white">
                    <div className={`w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 mb-5 shadow-2xl transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <Pill className="w-10 h-10 text-white" />
                    </div>
                    <h1 className={`text-5xl font-black tracking-tight mb-2 transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ textShadow: '0 0 60px rgba(129,140,248,0.3)' }}>
                        فاراماس
                    </h1>
                    <div className={`h-0.5 w-16 rounded-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent mb-3 transition-all duration-700 delay-400 ${mounted ? 'opacity-100' : 'opacity-0'}`} />
                    <p className={`text-sm text-white/40 font-medium mb-10 transition-all duration-700 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>نظام نقطة البيع للصيدليات</p>

                    {/* Features */}
                    <div className="space-y-3 w-full max-w-[240px]">
                        {[
                            { icon: Zap, text: "بيع سريع بالباركود", delay: 600 },
                            { icon: Shield, text: "عمل بدون إنترنت", delay: 700 },
                            { icon: BarChart3, text: "مزامنة تلقائية", delay: 800 },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className={`flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all duration-500 hover:bg-white/10 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                                style={{ transitionDelay: `${item.delay}ms` }}
                            >
                                <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                    <item.icon className="w-4 h-4 text-indigo-300 shrink-0" />
                                </div>
                                <span className="text-xs text-white/70 font-medium">{item.text}</span>
                            </div>
                        ))}
                    </div>

                    {/* Version */}
                    <p className="absolute bottom-4 text-[10px] text-white/20 font-mono">v1.0.0</p>
                </div>
            </div>

            {/* Left Side — Login Form */}
            <div className="flex-1 flex items-center justify-center bg-background p-8">
                <div className={`w-full max-w-sm transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                    <div className="bg-card rounded-2xl p-8 shadow-xl shadow-black/5 ring-1 ring-border">
                        <h2 className="text-xl font-bold text-foreground text-center mb-1">تسجيل الدخول</h2>
                        <p className="text-muted-foreground text-center text-sm mb-6">أدخل بيانات حسابك</p>

                        {error && (
                            <div className="bg-destructive/10 text-destructive p-3 rounded-xl mb-4 text-sm text-center font-medium border border-destructive/20 animate-slideUp">
                                {error}
                            </div>
                        )}

                        <div className="space-y-4" onKeyDown={handleKeyDown}>
                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">البريد الإلكتروني</label>
                                <input
                                    type="email"
                                    className="w-full p-3 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all bg-muted/30"
                                    placeholder="example@faramace.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    dir="ltr"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">كلمة المرور</label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        className="w-full p-3 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all bg-muted/30 pl-10"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        dir="ltr"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleLogin}
                                disabled={!email || !password || isLoading}
                                className="w-full bg-gradient-to-l from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 active:scale-[0.98]"
                            >
                                {isLoading ? (
                                    <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <span>دخول</span>
                                        <ArrowLeft className="w-4 h-4" />
                                    </>
                                )}
                            </button>

                            <p className="text-center text-[10px] text-muted-foreground mt-3">
                                يرجى التأكد من اتصال الإنترنت للمزامنة الأولى
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
