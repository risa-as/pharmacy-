import { Check } from 'lucide-react';
import CTAButton from './cta-button';

type PricingCardProps = {
  title: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  isPopular?: boolean;
  ctaText?: string;
  delay?: number;
};

export default function PricingCard({
  title,
  price,
  period = 'شهرياً',
  description,
  features,
  isPopular = false,
  ctaText = 'اختر الباقة',
  delay = 0
}: PricingCardProps) {
  return (
    <div 
      className={`relative bg-white dark:bg-slate-900 rounded-3xl p-8 border-2 transition-all duration-300 transform hover:-translate-y-2 flex flex-col h-full ${
        isPopular ? 'border-primary-500 shadow-xl shadow-primary-500/10' : 'border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-primary-200 dark:hover:border-primary-800'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {isPopular && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-accent to-accent-hover text-white text-sm font-bold py-1.5 px-4 rounded-full shadow-md">
          الأكثر طلباً
        </div>
      )}
      
      <div className="mb-8">
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">{description}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black text-slate-900 dark:text-white">{price}</span>
          {price !== 'مخصص' && (
            <span className="text-slate-500 dark:text-slate-400 font-medium">/{period}</span>
          )}
        </div>
      </div>
      
      <div className="flex-grow">
        <div className="h-px bg-slate-100 dark:bg-slate-800 w-full mb-6"></div>
        <ul className="space-y-4 mb-8">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <div className={`mt-1 shrink-0 flex items-center justify-center w-5 h-5 rounded-full ${isPopular ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                <Check size={12} strokeWidth={3} />
              </div>
              <span className="text-slate-600 dark:text-slate-300 leading-relaxed">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="mt-auto pt-4">
        <CTAButton 
          variant={isPopular ? 'primary' : 'outline'} 
          fullWidth 
          href="/contact"
        >
          {ctaText}
        </CTAButton>
      </div>
    </div>
  );
}
