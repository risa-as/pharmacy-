import { ReactNode } from 'react';

type FeatureCardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  delay?: number;
  points?: string[];
};

export default function FeatureCard({ title, description, icon, points }: FeatureCardProps) {
  return (
    <div className="group relative h-full rounded-2xl bg-white p-7 ring-1 ring-slate-200/80 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift hover:ring-primary-200">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 transition-colors duration-300 group-hover:bg-primary-700 group-hover:text-white">
        {icon}
      </div>
      <h3 className="mb-2.5 text-lg font-extrabold text-slate-900">{title}</h3>
      <p className="leading-relaxed text-slate-600">{description}</p>
      {points && (
        <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
