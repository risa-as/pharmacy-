'use client';

import { useEffect, useState, useRef } from 'react';

type CounterAnimationProps = {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  label: string;
  delay?: number;
};

export default function CounterAnimation({
  end,
  duration = 2000,
  prefix = '',
  suffix = '',
  label,
  delay = 0
}: CounterAnimationProps) {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const counterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (counterRef.current) {
      observer.observe(counterRef.current);
    }

    return () => {
      if (counterRef.current) {
        observer.unobserve(counterRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    let startTime: number | null = null;
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;

      // Calculate progress (0 to 1)
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Use easeOutQuart easing function for smoother animation
      const easeProgress = 1 - Math.pow(1 - progress, 4);

      setCount(Math.floor(easeProgress * end));

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(animate);
      } else {
        setCount(end); // Ensure we end exactly on the target number
      }
    };

    const timeoutId = setTimeout(() => {
      animationFrameId = window.requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [end, duration, isVisible, delay]);

  return (
    <div ref={counterRef} className="text-center">
      <div className="flex items-center justify-center font-black text-4xl md:text-5xl text-white-600 mb-2">
        {prefix && <span className="mr-1">{prefix}</span>}
        <span>{count.toLocaleString('ar-EG')}</span>
        {suffix && <span className="ml-1">{suffix}</span>}
      </div>
      <p className="text-slate-600 font-medium text-lg">{label}</p>
    </div>
  );
}
