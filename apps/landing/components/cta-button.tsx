import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ButtonHTMLAttributes } from 'react';

interface CTAButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'glass' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: boolean;
  fullWidth?: boolean;
}

export default function CTAButton({
  children,
  href,
  variant = 'primary',
  size = 'md',
  icon = false,
  fullWidth = false,
  className = '',
  ...props
}: CTAButtonProps) {
  const base =
    'group inline-flex items-center justify-center font-bold transition-all duration-200 rounded-xl active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500';

  const variants = {
    primary: 'bg-primary-700 text-white shadow-soft hover:bg-primary-800 hover:shadow-lift',
    accent: 'bg-primary-400 text-ink-950 shadow-soft hover:bg-primary-300 hover:shadow-lift',
    secondary: 'bg-white text-primary-800 shadow-soft ring-1 ring-slate-200 hover:ring-primary-200 hover:shadow-lift',
    outline: 'bg-transparent text-primary-700 ring-1 ring-inset ring-primary-300 hover:bg-primary-50',
    glass: 'bg-white/10 text-white ring-1 ring-inset ring-white/25 backdrop-blur-md hover:bg-white/20',
  };

  const sizes = {
    sm: 'text-sm px-4 py-2 gap-2',
    md: 'text-base px-6 py-3 gap-2',
    lg: 'text-base md:text-lg px-7 py-3.5 md:py-4 gap-2.5',
  };

  const classes = `${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`;
  const arrow = icon && (
    <ArrowLeft size={size === 'lg' ? 20 : 18} className="transition-transform duration-200 group-hover:-translate-x-1" aria-hidden="true" />
  );

  if (href) {
    const external = /^https?:\/\//.test(href);
    return (
      <Link href={href} className={classes} {...(external ? { rel: 'noopener' } : {})}>
        {children}
        {arrow}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
      {arrow}
    </button>
  );
}
