type SectionHeadingProps = {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
  titleClassName?: string;
  badge?: string;
};

export default function SectionHeading({
  title,
  subtitle,
  align = 'center',
  className = '',
  titleClassName = 'text-white',
  badge
}: SectionHeadingProps) {
  const alignmentClasses = {
    left: 'text-left items-start',
    center: 'text-center items-center',
    right: 'text-right items-start',
  };

  return (
    <div className={`flex flex-col mb-16 ${alignmentClasses[align]} ${className}`}>
      {badge && (
        <span className="inline-block py-1 px-3 rounded-full bg-primary-100 text-primary-700 text-sm font-bold mb-4">
          {badge}
        </span>
      )}
      <h2 className={`text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-tight ${titleClassName}`}>
        {title}
      </h2>

      {/* Decorative Line */}
      <div className={`w-24 h-1.5 bg-gradient-brand rounded-full mb-6 ${align === 'center' ? 'mx-auto' : ''}`}></div>

      {subtitle && (
        <p className="text-lg text-slate-600 max-w-3xl leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
