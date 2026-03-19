import { NextResponse } from 'next/server';
import { z } from 'zod';

// لتغيير رقم الواتساب: عدّل قيمة WHATSAPP_PHONE_NUMBER في ملف .env.local
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE_NUMBER || '96407519232339';

const contactSchema = z.object({
  name: z.string().min(2, { message: 'الاسم مطلوب ويجب أن يتكون من حرفين على الأقل' }),
  phone: z.string().regex(/^(07\d{8,9}|(\+964)\d{9,10})$/, { message: 'رقم هاتف غير صالح، يرجى إدخال رقم عراقي صحيح (مثال: 078... أو 077...)' }),
  pharmacy: z.string().optional(),
  message: z.string().min(5, { message: 'الرسالة مطلوبة ويجب أن تحتوي على 5 أحرف على الأقل' }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Server-side validation using Zod
    const validationResult = contactSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors[0].message;
      return NextResponse.json({ message: errorMessage }, { status: 400 });
    }

    const { name, phone, pharmacy, message } = validationResult.data;

    // Build the WhatsApp message text
    const waText = [
      '🌿 *رسالة جديدة من الموقع التعريفي - فاراماس*',
      '',
      `👤 *الاسم:* ${name}`,
      `📞 *الهاتف:* ${phone}`,
      pharmacy ? `🏥 *الصيدلية:* ${pharmacy}` : null,
      '',
      `💬 *الرسالة:*\n${message}`,
    ].filter(Boolean).join('\n');

    // Build the wa.me redirect link
    const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(waText)}`;

    return NextResponse.json(
      { message: 'تم إرسال الرسالة بنجاح', whatsappUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error('Contact API Error:', error);
    return NextResponse.json(
      { message: 'حدث خطأ في الخادم أثناء معالجة طلبك' },
      { status: 500 }
    );
  }
}
