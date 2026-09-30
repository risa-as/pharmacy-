# صور الموقع من النظام الحقيقي

الصور في `public/shots` ملتقطة من نسخة من النظام تعمل على بيانات العرض (`apps/web/prisma/demo`)، لا من حساب عميل.
الشعار في `public/brand` مستخرج من `apps/web/public/logo.png`.

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
