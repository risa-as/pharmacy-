"use client";

import { useState } from "react";
import { Mail, MapPin, Phone, Send, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import SectionHeading from "../../components/section-heading";
import CTAButton from "../../components/cta-button";

const contactSchema = z.object({
  name: z
    .string()
    .min(2, { message: "الاسم مطلوب ويجب أن يتكون من حرفين على الأقل" }),
  phone: z.string().regex(/^(07\d{8,9}|(\+964)\d{9,10})$/, {
    message:
      "رقم هاتف غير صالح، يرجى إدخال رقم عراقي صحيح (مثال: 078... أو 077...)",
  }),
  pharmacy: z.string().optional(),
  message: z
    .string()
    .min(5, { message: "الرسالة مطلوبة ويجب أن تحتوي على 5 أحرف على الأقل" }),
});

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    pharmacy: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      // Client-side validation using Zod
      const validationResult = contactSchema.safeParse(formData);
      if (!validationResult.success) {
        setError(validationResult.error.errors[0].message);
        setIsSubmitting(false);
        return;
      }

      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "حدث خطأ أثناء إرسال الرسالة");
      }

      setIsSuccess(true);
      setFormData({ name: "", phone: "", pharmacy: "", message: "" });

      // Open WhatsApp with the pre-filled message
      if (data.whatsappUrl) {
        window.open(data.whatsappUrl, "_blank");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-grow pt-32 pb-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in-up">
          <SectionHeading
            title="نحن هنا لمساعدتك دائماً"
            subtitle="فريق المبيعات والدعم الفني متواجد للإجابة على جميع استفساراتك ومساعدتك في اختيار الباقة الأنسب لصيدليتك."
            badge="تواصل معنا"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
          {/* Contact Form */}
          <div className="bg-white dark:bg-slate-900 p-8 md:p-10 rounded-3xl shadow-lg border border-slate-100 dark:border-slate-800 transition-colors duration-300">
            {isSuccess ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 size={40} />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                  تم إرسال رسالتك بنجاح!
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-8">
                  سيتواصل معك فريقنا في أقرب وقت الممكن على رقم الهاتف الذي
                  أدخلته.
                </p>
                <CTAButton
                  onClick={() => setIsSuccess(false)}
                  variant="outline"
                >
                  إرسال رسالة أخرى
                </CTAButton>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                  أرسل لنا رسالة
                </h3>

                {error && (
                  <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm mb-6">
                    {error}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label
                      htmlFor="name"
                      className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      الاسم الكامل <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                      placeholder="د. محمد علي"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="phone"
                      className="text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      رقم الهاتف <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      required
                      dir="ltr"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-right"
                      placeholder="0780 000 0000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="pharmacy"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    اسم الصيدلية
                  </label>
                  <input
                    type="text"
                    id="pharmacy"
                    name="pharmacy"
                    value={formData.pharmacy}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                    placeholder="صيدلية الشفاء"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="message"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    الرسالة <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={4}
                    required
                    value={formData.message}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none resize-none"
                    placeholder="أود الاستفسار عن تفاصيل الباقة الاحترافية..."
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-primary-500/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  {isSubmitting ? (
                    "جاري الإرسال..."
                  ) : (
                    <>
                      إرسال الرسالة
                      <Send size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Contact Information */}
          <div className="flex flex-col justify-center space-y-8">
            <div className="bg-primary-50 dark:bg-primary-900/10 rounded-3xl p-8 border border-primary-100 dark:border-primary-900/30 transition-colors duration-300">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
                معلومات الاتصال المباشر
              </h3>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
                    <MapPin size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">
                      العنوان الرئيسي
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                      العراق، بغداد
                      <br />
                      الدورة , شارع ابو طيارة
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
                    <Phone size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">
                      أرقام الهواتف (مكالمات + واتساب)
                    </h4>
                    <p
                      className="text-slate-600 dark:text-slate-400 mt-1"
                      dir="ltr"
                    >
                      07857581997
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
                    <Mail size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white">
                      البريد الإلكتروني
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                      info@faramace.com
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      sales@faramace.com
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-600/30 rounded-full blur-2xl"></div>
              <h3 className="text-xl font-bold mb-4 relative z-10">
                ساعات العمل والدعم
              </h3>
              <ul className="space-y-3 relative z-10 text-slate-300">
                <li className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span>السبت - الخميس:</span>
                  <span className="font-semibold text-white">
                    9:00 ص - 5:00 م
                  </span>
                </li>
                <li className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span>الجمعة:</span>
                  <span className="font-semibold text-white">
                    4:00 م - 6:00 م
                  </span>
                </li>
                <li className="flex items-center gap-2 mt-4 text-primary-400 font-bold">
                  <CheckCircle2 size={16} />
                  <span>دعم الحالات الطارئة متوفر 24/7 للمشتركين</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
