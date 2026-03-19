import { Star, Quote } from 'lucide-react';
import Image from 'next/image';

type TestimonialCardProps = {
  name: string;
  pharmacyName: string;
  quote: string;
  image?: string;
  rating?: number;
  delay?: number;
};

export default function TestimonialCard({
  name,
  pharmacyName,
  quote,
  image,
  rating = 5,
  delay = 0
}: TestimonialCardProps) {
  return (
    <div 
      className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 relative group"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Decorative Quote Mark */}
      <div className="absolute top-6 right-6 text-primary-100 group-hover:text-primary-200 transition-colors duration-300">
        <Quote size={48} />
      </div>

      {/* Stars */}
      <div className="flex items-center gap-1 mb-6 relative z-10">
        {[...Array(5)].map((_, i) => (
          <Star 
            key={i} 
            size={18} 
            className={i < rating ? "fill-accent text-accent" : "fill-slate-100 text-slate-200"} 
          />
        ))}
      </div>

      <p className="text-slate-700 text-lg leading-relaxed mb-8 relative z-10 italic">
        "{quote}"
      </p>

      <div className="flex items-center gap-4 relative z-10">
        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg overflow-hidden shrink-0 border-2 border-primary-50">
          {image ? (
            <Image src={image} alt={name} width={48} height={48} className="object-cover" />
          ) : (
            name.charAt(0)
          )}
        </div>
        <div>
          <h4 className="font-bold text-slate-900">{name}</h4>
          <p className="text-sm text-primary-600 font-medium">{pharmacyName}</p>
        </div>
      </div>
    </div>
  );
}
