import { useState, useMemo, useEffect } from 'react';
import DashboardPage from './components/DashboardPage';
import POSLayout from './components/POSLayout';
import DebtsPage from './components/DebtsPage';
import SettingsPage from './components/SettingsPage';
import InventoryPage from './components/InventoryPage';
import LoginScreen from './components/LoginScreen';
import LicenseScreen from './components/LicenseScreen';

import { ShoppingCart, Settings, LogOut, Package, LayoutDashboard, BookOpen, Moon, Sun, Loader2 } from 'lucide-react';
import logoUrl from './assets/logo.png';




type Page = 'dashboard' | 'pos' | 'settings' | 'inventory' | 'debts';

const allNavItems: { id: Page; icon: any; label: string; roles: string[] }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'لوحة المعلومات', roles: ['ADMIN', 'PHARMACIST', 'CASHIER'] },
    { id: 'pos', icon: ShoppingCart, label: 'نقطة البيع', roles: ['ADMIN', 'PHARMACIST', 'CASHIER'] },
    { id: 'debts', icon: BookOpen, label: 'الديون', roles: ['ADMIN', 'PHARMACIST', 'CASHIER'] },
    { id: 'inventory', icon: Package, label: 'المخزن', roles: ['ADMIN', 'PHARMACIST'] },
    { id: 'settings', icon: Settings, label: 'الإعدادات', roles: ['ADMIN'] },
];

const roleLabels: Record<string, string> = {
    ADMIN: 'مدير',
    PHARMACIST: 'صيدلاني',
    CASHIER: 'كاشير',
};

const roleColors: Record<string, string> = {
    ADMIN: 'from-violet-500 to-purple-600',
    PHARMACIST: 'from-emerald-500 to-teal-600',
    CASHIER: 'from-blue-500 to-indigo-600',
};

// Extend Window type for the Electron theme bridge exposed by preload.ts
declare global {
    interface Window {
        electronTheme?: {
            getTheme: () => Promise<string>;
            setTheme: (v: string) => Promise<void>;
        };
    }
}

type LicenseStatus = 'checking' | 'valid' | 'invalid' | 'no-key';







function App() {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState<Page>('dashboard');
    const [isDark, setIsDark] = useState(false);

    // ==================== Electron Focus Fix ====================
    // Fallback: if keyboard events still land on <body> (Chromium lost internal
    // focus without a detectable DOM event), trigger the OS focus cycle via IPC.
    useEffect(() => {
        const handleKeyDown = () => {
            if (document.activeElement === document.body || document.activeElement === document.documentElement) {
                window.ipcRenderer?.send('refocus-window');
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    // ==================== Session Restore ====================
    useEffect(() => {
        window.ipcRenderer?.invoke('get-session-user').then((res: any) => {
            if (res?.success && res.user) setCurrentUser(res.user);
        }).catch(() => {}).finally(() => setSessionLoading(false));
    }, []);
    // ==================== End Session Restore ====================

    // ==================== License Guard State ====================
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>('checking');
    const [licenseError, setLicenseError] = useState<string | null>(null);

    useEffect(() => {
        const verifyLicense = async () => {
            const savedKey = localStorage.getItem('faramace_license_key');
            if (!savedKey) { setLicenseStatus('no-key'); return; }
            try {
                const identity = await window.electronLicense?.getHardwareId();
                if (!identity?.success || !identity.hardwareId) {
                    setLicenseStatus('invalid');
                    setLicenseError('فشل في قراءة معرّف الجهاز. الرجاء إعادة تشغيل التطبيق.');
                    return;
                }
                const result = await window.electronLicense?.verify({
                    licenseKey: savedKey,
                    hardwareId: identity.hardwareId,
                });
                if (!result || result.data?.error === 'SERVER_UNREACHABLE') {
                    console.warn('[License] Server unreachable, allowing offline mode.');
                    setLicenseStatus('valid'); return;
                }
                if (result.ok && result.data?.success && result.data?.valid) {
                    setLicenseStatus('valid');
                } else {
                    setLicenseStatus('invalid');
                    if (result.data?.error?.includes('Hardware Mismatch')) {
                        setLicenseError('هذا الجهاز غير مصرّح له. تواصل مع الدعم الفني.');
                    } else if (result.data?.error?.includes('expired') || result.data?.error?.includes('inactive')) {
                        setLicenseError('انتهت صلاحية الاشتراك. الرجاء تجديد الاشتراك.');
                    } else {
                        setLicenseError('الترخيص غير صالح. الرجاء إعادة التفعيل.');
                    }
                    localStorage.removeItem('faramace_license_key');
                }
            } catch {
                console.warn('[License] IPC error, allowing offline mode.');
                setLicenseStatus('valid');
            }
        };
        verifyLicense();
    }, []);

    const handleLicenseActivated = () => {
        setLicenseStatus('valid');
        setLicenseError(null);
    };
    // ==================== End License Guard ====================


    // Theme initialisation — read persisted preference from electron-store on mount
    useEffect(() => {
        const initTheme = async () => {
            try {
                const theme = await window.electronTheme?.getTheme() ?? 'system';
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const shouldBeDark = theme === 'dark' || (theme === 'system' && prefersDark);
                if (shouldBeDark) {
                    document.documentElement.classList.add('dark');
                    setIsDark(true);
                }
            } catch {
                // Graceful fallback if IPC is unavailable (dev HMR reload)
            }
        };
        void initTheme();
    }, []);

    const toggleTheme = async () => {
        const next = !isDark;
        setIsDark(next);
        document.documentElement.classList.toggle('dark', next);
        try {
            await window.electronTheme?.setTheme(next ? 'dark' : 'light');
        } catch { /* offline or test environment — preference not persisted */ }
    };

    const userRole = currentUser?.role || 'CASHIER';

    // Filter nav items based on user role
    const navItems = useMemo(() => {
        return allNavItems.filter(item => item.roles.includes(userRole));
    }, [userRole]);

    // Auto-redirect to allowed page if current page is not accessible
    useEffect(() => {
        if (!currentUser) return;
        const allowedPages = navItems.map(i => i.id);
        if (!allowedPages.includes(currentPage)) {
            setCurrentPage(allowedPages[0] || 'dashboard');
        }
    }, [currentUser, navItems, currentPage]);

    // Load Company Settings
    useEffect(() => {
        const loadSettings = async () => {
            try {
                // Assuming we have an ipc handler for this or using direct fetch if allowed
                const settings = await window.ipcRenderer.invoke('get-company-settings');
                if (settings && (settings as any).currency) {
                    import('./utils/currency').then(({ setAppCurrency }) => {
                        setAppCurrency((settings as any).currency);
                    });
                }
            } catch (error) {
                console.error("Failed to load settings:", error);
            }
        };
        loadSettings();
    }, []);

    // ==================== License Guard Render ====================
    if (licenseStatus === 'checking' || sessionLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 gap-4">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-zinc-500 text-sm">{sessionLoading ? 'جاري استعادة الجلسة...' : 'جاري التحقق من الترخيص...'}</p>
            </div>
        );
    }
    if (licenseStatus === 'no-key' || licenseStatus === 'invalid') {
        return <LicenseScreen onActivated={handleLicenseActivated} errorMessage={licenseError} />;
    }
    // ==================== End License Guard Render ====================


    if (!currentUser) {
        return <LoginScreen onLogin={setCurrentUser} />;
    }

    return (
        <div className="flex h-screen bg-background font-sans text-foreground">
            {/* Sidebar */}
            <div dir="rtl" className="w-[68px] bg-zinc-900 flex flex-col items-center py-4 gap-1 shadow-2xl z-30 shrink-0">
                {/* Brand */}
                <div className="mb-2 w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-blue-900/30">
                    <img src={logoUrl} alt="فاراماس" className="w-full h-full object-cover" />
                </div>

                <div className="w-8 h-px bg-zinc-800 mb-1" />

                {/* Nav Items — filtered by role */}
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setCurrentPage(item.id)}
                            className={`relative group p-2.5 rounded-xl transition-all duration-200 ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
                                }`}
                        >
                            <Icon className="w-5 h-5" />
                            {/* Tooltip */}
                            <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-zinc-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-lg scale-90 group-hover:scale-100">
                                {item.label}
                                <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-zinc-800" />
                            </div>
                            {/* Active Indicator */}
                            {isActive && (
                                <div className="absolute -left-[2px] top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-400 rounded-r-full" />
                            )}
                        </button>
                    );
                })}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-all duration-200"
                    title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* Role Badge */}
                <div className={`mb-1 px-1.5 py-0.5 rounded-md bg-gradient-to-l ${roleColors[userRole] || roleColors.CASHIER} text-[8px] font-black text-white text-center leading-tight`}>
                    {roleLabels[userRole] || userRole}
                </div>

                {/* User Avatar */}
                <div className="mb-1.5 w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-400 text-xs font-bold">
                    {currentUser?.name?.charAt(0) || '؟'}
                </div>

                {/* Logout */}
                <button
                    onClick={() => { window.ipcRenderer?.invoke('logout').catch(() => {}); setCurrentUser(null); }}
                    className="relative group p-2.5 rounded-xl text-zinc-600 hover:bg-red-500/15 hover:text-red-400 transition-all duration-200"
                >
                    <LogOut className="w-5 h-5" />
                    <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-zinc-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-lg scale-90 group-hover:scale-100">
                        تسجيل الخروج
                        <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-zinc-800" />
                    </div>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative">
                {currentPage === 'dashboard' && <DashboardPage user={currentUser} />}
                {currentPage === 'pos' && <POSLayout user={currentUser} />}
                {currentPage === 'debts' && <DebtsPage />}
                {currentPage === 'inventory' && <InventoryPage user={currentUser} />}
                {currentPage === 'settings' && <SettingsPage />}
            </div>
        </div>
    );
}

export default App;
