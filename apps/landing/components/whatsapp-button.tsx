"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";

export default function WhatsAppButton() {
  const [isVisible, setIsVisible] = useState(false);

  // Show button after 3 seconds or when scrolled
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 3000);

    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <a
      href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_PHONE_NUMBER}?text=مرحباً، أود الاستفسار عن نظام فاراماس لإدارة الصيدليات`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 bg-[#25D366] text-white rounded-full shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 animate-bounce"
      aria-label="تواصل معنا عبر واتساب"
    >
      <MessageCircle size={32} />

      {/* Ripple Effect */}
      <span className="absolute w-full h-full rounded-full bg-[#25D366] animate-ping opacity-20 -z-10"></span>
    </a>
  );
}
