'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * ThemeToggle — dark/light mode switch for Web Dashboard.
 *
 * Reads initial state from the `dark` class already applied by the
 * anti-flash script in layout.tsx, so there is no flicker on mount.
 * Persists preference to `localStorage` key `faramace-theme`.
 */
export function ThemeToggle() {
    const [isDark, setIsDark] = useState(false);

    // Sync with the class that was set by the anti-flash script
    useEffect(() => {
        setIsDark(document.documentElement.classList.contains('dark'));
    }, []);

    const toggle = () => {
        const next = !isDark;
        setIsDark(next);
        document.documentElement.classList.toggle('dark', next);
        try {
            localStorage.setItem('faramace-theme', next ? 'dark' : 'light');
        } catch { /* private browsing — ignore */ }
    };

    return (
        <button
            onClick={toggle}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200"
            aria-label={isDark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
            title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
        >
            {isDark
                ? <Sun  className="w-5 h-5" />
                : <Moon className="w-5 h-5" />
            }
        </button>
    );
}
