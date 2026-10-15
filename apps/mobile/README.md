# 📱 تطبيق فاراماس للهاتف

تطبيق إدارة الصيدليات للهواتف المحمولة - يعمل على **Android** و **iOS**.

## 🚀 التثبيت والتشغيل

### المتطلبات
- Node.js 18+
- pnpm
- Expo CLI
- Android Studio (لـ Android)
- Xcode (لـ iOS - Mac فقط)

### الخطوات

```bash
# 1. انتقل لمجلد التطبيق
cd apps/mobile

# 2. تثبيت المكتبات
pnpm install

# 3. تشغيل التطبيق
npx expo start
```

### التشغيل على الجهاز

```bash
# Android
npx expo start --android

# iOS
npx expo start --ios

# متصفح الويب
npx expo start --web
```

## 📁 هيكل المشروع

```
apps/mobile/
├── app/                    # شاشات التطبيق
│   ├── (tabs)/             # التبويبات السفلية
│   │   ├── index.tsx       # الرئيسية
│   │   ├── inventory.tsx   # المخزون
│   │   ├── sales.tsx       # المبيعات
│   │   └── settings.tsx    # الإعدادات
│   ├── login.tsx           # تسجيل الدخول
│   └── _layout.tsx         # Layout رئيسي
├── services/               # خدمات API
│   ├── api.ts              # طلبات API
│   └── auth.ts             # المصادقة
├── hooks/                  # React Hooks
│   └── useAuth.ts          # hook المصادقة
├── app.json                # إعدادات Expo
└── package.json            # التبعيات
```

## 🔗 ربط API

عنوان الخادم ثابت في البناء ولا يمكن تغييره من داخل التطبيق:

- نسخ التوزيع: `EXPO_PUBLIC_API_URL` في `eas.json` (حالياً `https://app.faramace.com/api`).
- التطوير المحلي: في `.env`، ثم أعد تشغيل Metro بـ `pnpm start --clear`.

```bash
EXPO_PUBLIC_API_URL=http://YOUR_SERVER_IP:3000/api
```

## 📦 بناء التطبيق

```bash
# بناء للتوزيع
npx eas build --platform android
npx eas build --platform ios
```

## التحديثات التلقائية عبر Expo

- المشروع: https://expo.dev/accounts/risa02/projects/faramace
- النسخة المهيأة للتحديثات: `1.0.1` وما بعدها. النسخ الأقدم لا تحتوي آلية OTA، ويجب تثبيت APK الجديد مرة واحدة فوق النسخة القديمة، دون حذف التطبيق أو بياناته.
- قناة المستخدمين: `production`، وقناة التجربة: `preview`. بناء `production-apk` ينتج APK للمستخدمين بقناة `production`؛ بناء `preview` لا يستقبل تحديثات المستخدمين.
- رفع تعديلات الهاتف إلى `codex/mobile-automatic-updates` أو، بعد دمج هذا الإعداد فيهما، `codex/release-readiness-fixes` والفرع الافتراضي `004-dynamic-subscriptions` يشغّل `.github/workflows/mobile-update.yml`: تثبيت التبعيات، اختبارات الهاتف، فحص TypeScript، ثم نشر EAS Update. انتظر نجاح المهمة في GitHub Actions.
- يعتمد النشر على سر المستودع `EXPO_TOKEN`. لا تضع قيمته في الكود أو ملفات البيئة المرفوعة.
- ينشر المسار عنوان API الإنتاجي `https://app.faramace.com/api` ويتجاهل ملفات `.env` المحلية. قِيَم `env` في `eas.json` تخص البناء ولا تنتقل تلقائياً إلى `eas update`؛ لذلك يحدد مسار GitHub العنوان صراحةً.
- يفحص التطبيق التحديث عند الفتح، ثم ينزله في الخلفية عند العودة للتطبيق أو كل 15 دقيقة أثناء الاستخدام. يطبق التحديث المحمّل عند إغلاق التطبيق بالكامل وفتحه مجدداً، دون إعادة تشغيل مفاجئة أثناء البيع. يلزم اتصال بالإنترنت للتنزيل، وتظل النسخة الحالية تعمل عند انقطاعه.
- سياسة `appVersion` تربط التحديث بإصدار التطبيق الأصلي. يفحص `scripts/check-mobile-runtime.mjs` الإعدادات والتبعيات وملف القفل قبل النشر ويوقف OTA عند تغيرها. عند هذا التغيير: ارفع `expo.version`، ونفذ `node scripts/check-mobile-runtime.mjs --record` من جذر المستودع، ثم ابنِ ووزّع APK/AAB/IPA جديداً. يُعامل تغيير ملف القفل باحتياط كتغيير أصلي. تعديلات JavaScript/TypeScript والأصول المتوافقة تصل عبر OTA.
- مجلدا `android` و`ios` مولدان ومستبعدان من Git وأرشيف EAS؛ مصدر إعداداتهما `app.json` وإضافات Expo.

```bash
# من apps/mobile، مع حساب Expo مسجل الدخول
# اضبط EXPO_PUBLIC_API_URL=https://app.faramace.com/api وEXPO_NO_DOTENV=1 في بيئة الطرفية
pnpm build:production:apk
pnpm update:production --message "وصف التحديث"
pnpm update:preview --message "تحديث تجريبي"
```

لا تختبر وصول OTA بواسطة Expo Go؛ اختبر باستخدام APK مبني بقناة صحيحة وبصمة متوافقة. تأكد من بقاء سلة البيع أثناء تنزيل تحديث، ثم أغلق التطبيق وافتحه وتحقق من التغيير المنشور. للاطلاع على التنزيلات والأخطاء استخدم لوحة EAS Update في المشروع.

## 🔑 بيانات الدخول التجريبية

- البريد: `admin@faramace.com`
- كلمة المرور: `password`
