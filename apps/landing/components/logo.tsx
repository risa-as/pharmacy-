import Link from 'next/link';

/** Brand mark: a rounded tile with a capsule crossed by a plus. */
export function LogoMark({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="fm-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f7575" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#fm-tile)" />
      <rect x="9" y="15.5" width="22" height="9" rx="4.5" fill="#fff" transform="rotate(-35 20 20)" />
      <rect x="20" y="15.5" width="11" height="9" rx="4.5" fill="#F59E0B" transform="rotate(-35 20 20)" />
    </svg>
  );
}

export default function Logo({ tone = 'dark', href = '/' }: { tone?: 'dark' | 'light'; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="فاراماس — الصفحة الرئيسية">
      <LogoMark />
      <span className={`text-2xl font-black tracking-tight ${tone === 'light' ? 'text-white' : 'text-slate-900'}`}>
        فاراماس
      </span>
    </Link>
  );
}
