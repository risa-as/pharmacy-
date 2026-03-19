import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ButtonHTMLAttributes } from 'react';

interface CTAButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  href?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'glass';
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
  
  const baseClasses = "inline-flex items-center justify-center font-bold transition-all duration-300 rounded-xl transform active:scale-95";
  
  const variants = {
    primary: "bg-gradient-primary text-white shadow-lg hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5 border border-transparent",
    secondary: "bg-white text-primary-700 shadow-md hover:shadow-lg hover:-translate-y-0.5 border border-slate-100 hover:border-primary-100",
    outline: "bg-transparent text-primary-700 border-2 border-primary-600 hover:bg-primary-50",
    glass: "bg-white/20 backdrop-blur-md text-white border border-white/40 hover:bg-white/30"
  };
  
  const sizes = {
    sm: "text-sm px-4 py-2 gap-2",
    md: "text-base px-6 py-3 gap-2",
    lg: "text-lg px-8 py-4 gap-3"
  };
  
  const widthClass = fullWidth ? 'w-full' : '';
  const mergedClasses = `${baseClasses} ${variants[variant]} ${sizes[size]} ${widthClass} ${className}`;

  if (href) {
    return (
      <Link href={href} className={mergedClasses}>
        {children}
        {icon && <ArrowLeft size={size === 'lg' ? 24 : 20} className="mr-1" />}
      </Link>
    );
  }

  return (
    <button className={mergedClasses} {...props}>
      {children}
      {icon && <ArrowLeft size={size === 'lg' ? 24 : 20} className="mr-1" />}
    </button>
  );
}
