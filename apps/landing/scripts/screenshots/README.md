# صور الموقع من النظام الحقيقي

الصور في `public/shots` ملتقطة من نسخة من النظام تعمل على بيانات العرض (`apps/web/prisma/demo`)، لا من حساب عميل.
الشعار في `public/brand` مستخرج من `apps/web/public/logo.png`.

## تحديث أكتوبر 2026

أُعيد التقاط الصفحة الرئيسية بعد تحديث تصميم النظام: `web-dashboard-20261001.webp` بمقاس 2400×1600، من لقطة أصلية 2880×1920. تُستخدم في الرئيسية والمزايا، بجودة عرض 90 واسم جديد لتجنب عرض الصورة القديمة من الذاكرة المؤقتة.

- `desktop-pos.webp`: لقطة فعلية من Electron على Windows، بقاعدة SQLite وملف مستخدم مستقلين عن التطبيق المثبت. أضيفت أصناف إلى السلة دون إتمام عملية بيع.
- `android-home.webp` و`android-smart-order.webp`: لقطات من تطبيق React Native الأصلي داخل Expo Go SDK 54 على محاكي Android مستقل، وليستا لقطات من نسخة الويب. المحاكي متصل بقاعدة العرض المحلية فقط.
- `web-smart-purchasing.webp`: شاشة التخطيط الفعلية بعد اكتمال التحليل. بيانات العرض تتضمن تاريخ إنشاء مخزون سابقاً لفترة المبيعات حتى تكون فترة الرصد والكميات المقترحة واقعية.
- لقطات الويب والمخزون وبوابة المذخر أُعيد التقاطها من قاعدة `faramace_demo` مستقلة على `127.0.0.1:25479`؛ خادم العرض `http://localhost:3106`.
- `og-image.jpg`: تركيب عربي من الشعار ولقطتي Windows وAndroid الحقيقيتين.
- اللقطات الخام وأدوات تشغيل الجلسة محفوظة محلياً في `artifacts/landing-refresh-2026-10-01` ومستبعدة من git، ولا تتضمن صور حسابات عملاء. لا ترفع كلمات مرور العرض أو ملفات البيئة.

عند الالتقاط انتظر المحتوى الفعلي، وليس مدة ثابتة فقط. يدعم `capture-web.cjs` الخيار `ready=` لمحدد CSS، و`gone=` للنص الذي يجب أن يختفي بعد التحميل. مثال:

```bash
node capture-web.cjs admin@altafawuq.test "smart-purchasing=/dashboard/purchases/smart-order@1440x1150|gone=جاري تحليل المبيعات والمخزون والطلبات…"
```

## الخطوات

1. **جهّز قاعدة العرض وشغّل نظام الويب عليها:** اتبع `apps/web/prisma/demo/README.md`، والنتيجة خادم على `http://localhost:3100`.
2. **ثبّت playwright-core** خارج المشروع، واجعل Node يجده:

   ```bash
   npm i --prefix /tmp/capture playwright-core@1
   export NODE_PATH=/tmp/capture/node_modules
   ```

3. **التقط الصور** (كلمة المرور في `DEMO_PASSWORD`)، وتُحفظ في `raw/` وهو مستبعد من git:

   ```bash
   node capture-web.cjs admin@altafawuq.test dashboard=/dashboard batches=/dashboard/batches worders=/dashboard/purchases/warehouse-orders pos=/dashboard/pos-temp "m-web-dashboard=/dashboard@390x844" "m-alerts-expiry=/dashboard/alerts@390x844|click=css:button:has-text(\"قارب على الانتهاء\") >> nth=-1|scroll=css:input[type=text], input[type=search]"
   node capture-web.cjs owner@altafawuq-wh.test wh-home=/warehouse wh-orders=/warehouse/orders
   ```

   ضع الصور بمقاس الحاسوب قبل صور الهاتف في الأمر نفسه، لأن المقاس يبقى على آخر قيمة ضُبطت.
4. **حوّل الصور والشعار** إلى `public/`:

   ```bash
   node process.cjs
   ```

   مواضع القص في `process.cjs` مضبوطة على الصور الحالية. إذا تغيّر شكل شاشة في النظام، راجع القص قبل النشر.
