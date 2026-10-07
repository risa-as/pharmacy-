import Image from 'next/image';
import Link from 'next/link';

/** The Faramace mark (public/brand, derived from apps/web/public/logo.png); white variant for dark bands. */
export function LogoMark({ tone = 'dark', className = 'h-10 w-auto' }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <Image
      src={tone === 'light' ? '/brand/logo-mark-white.png' : '/brand/logo-mark.png'}
      alt=""
      width={368}
      height={256}
      className={className}
      priority
    />
  );
}

export default function Logo({ tone = 'dark', href = '/' }: { tone?: 'dark' | 'light'; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="فاراماس — الصفحة الرئيسية">
      <LogoMark tone={tone} />
      <span className={`text-2xl font-black tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink-900'}`}>
        فاراماس
      </span>
    </Link>
  );
}
