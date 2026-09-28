type SectionHeadingProps = {
  title: string;
  subtitle?: string;
  align?: 'center' | 'right';
  className?: string;
  titleClassName?: string;
  badge?: string;
  tone?: 'light' | 'dark';
};

/** Section eyebrow, title and lead. `tone="dark"` for dark bands. */
export default function SectionHeading({
  title,
  subtitle,
  align = 'center',
  className = '',
  titleClassName = '',
  badge,
  tone = 'light',
}: SectionHeadingProps) {
  const dark = tone === 'dark';
  return (
    <div className={`flex flex-col mb-14 ${align === 'center' ? 'items-center text-center mx-auto' : 'items-start text-right'} max-w-3xl ${className}`}>
      {badge && (
        <span
          className={`inline-flex items-center gap-2 py-1.5 ps-2 pe-3.5 rounded-full text-sm font-bold mb-5 ${
            dark ? 'bg-white/10 text-primary-200 ring-1 ring-white/15' : 'bg-primary-50 text-primary-700 ring-1 ring-primary-100'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-accent' : 'bg-primary-500'}`} />
          {badge}
        </span>
      )}
      <h2
        className={`text-3xl md:text-4xl lg:text-[2.75rem] font-black leading-[1.4] tracking-tight ${
          dark ? 'text-white' : 'text-slate-900'
        } ${titleClassName}`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-5 text-lg leading-relaxed ${dark ? 'text-primary-100/80' : 'text-slate-600'}`}>{subtitle}</p>
      )}
    </div>
  );
}
