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

غيّر عنوان الخادم في `services/api.ts`:

```typescript
const API_BASE_URL = 'http://YOUR_SERVER_IP:3000/api';
```

## 📦 بناء التطبيق

```bash
# بناء للتوزيع
npx eas build --platform android
npx eas build --platform ios
```

## 🔑 بيانات الدخول التجريبية

- البريد: `admin@faramace.com`
- كلمة المرور: `password`
