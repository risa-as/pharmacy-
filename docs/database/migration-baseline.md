# سلسلة الترحيلات وخط الأساس

## السبب (مُثبت)

كانت تعديلات المخطط تُطبَّق على الإنتاج بـ `prisma db push`. نتيجة ذلك أن **32 نموذجاً و7 أنواع (enum)** أُنشئت دون ترحيلات، بينما تعدّلها 25 ترحيلاً لاحقاً. فشل `prisma migrate deploy` على قاعدة فارغة عند `20260225000000_add_suspension_fields` (`relation "DeviceLicense" does not exist`)، وكان سيفشل بعده عند `DebtPayment` و`SaleReturn` و`Backup` و`Warehouse*` وغيرها. كما أُضيفت أعمدة بـ `db push` على جداول لها ترحيلات (`Supplier.organizationId`، `Batch.supplierId/costPrice/initialQuantity`، `GlobalDrug.isQuickSale`) وتحتاجها ترحيلات لاحقة.

سكربت التهيئة السابق أخفى ذلك: `db push` للمخطط الحالي ثم `migrate resolve --applied` لكل الترحيلات، فلم يُختبر تنفيذ السلسلة قط.

## الإصلاح

- **لم يُعدَّل أي ترحيل موجود** (الـ55 مثبتة بالبصمة في `scripts/database-baseline.json` تحت `historical`، ويتحقق منها `scripts/migrations.test.mjs`).
- **10 ترحيلات جديدة `…_restore_untracked_…`**، كلٌّ منها قبل الترحيل الذي يحتاجه بثانية، تنشئ ما كان يتوقعه ذلك الترحيل موجوداً: شكل كل جدول من **أقدم** نسخة من `schema.prisma` في git تحتويه (DDL يولّده Prisma)، ناقصاً ما تضيفه الترحيلات اللاحقة بنفسها، ومفاتيح أجنبية فقط لجداول موجودة عندها.
- **ترحيل أخير `20260928000000_reconcile_untracked_schema`**: الفرق بين نهاية السلسلة و`schema.prisma` الحالي (ولّده `prisma migrate diff`؛ لا حذف لجداول أو أعمدة ولا أوامر بيانات).
- النتيجة: `prisma migrate deploy` على قاعدة فارغة يطبّق 66 ترحيلاً، ويطابق `schema.prisma` تماماً (`migrate diff --exit-code` = 0)، مع الدوال والمشغّلات والتسلسلات.

## قاعدة جديدة

```bash
NEW_DATABASE_URL=postgresql://…/new_db node scripts/bootstrap-empty-db.mjs
```

يرفض قاعدة غير فارغة. ينفّذ `migrate deploy` فقط، ثم يتحقق من التطابق مع المخطط ومن وجود كائنات SQL. لا `db push` ولا `resolve`.

## قاعدة موجودة (عميل / إنتاج)

قواعد العملاء بُنيت بـ `db push`، فسجل `_prisma_migrations` فيها غائب أو ناقص؛ و`migrate deploy` وحده سيحاول إنشاء ما هو موجود. يُستخدم `scripts/baseline-existing-db.mjs`.

### متى يُستخدم `migrate resolve` (وهذا هو الموضع الوحيد)

فقط من داخل السكربت، وفقط للترحيلات **غير المسجّلة** التي تقع **حتى النقطة k** التي ثبت أن القاعدة تساويها، وبعد نجاح كل ما يلي، بهذا الترتيب:

1. **السجل سليم:** لا صفوف فاشلة أو ملغاة في `_prisma_migrations`، ولا أسماء غير موجودة محلياً، و**بصمة كل ترحيل مسجّل تساوي ملفه** (أي تعديل لترحيل مطبَّق يوقف العملية).
2. **التطابق الدقيق:** `prisma migrate diff --from-migrations <أول k ترحيلاً> --to-url <القاعدة> --shadow-database-url <shadow> --exit-code` يعيد 0. يعيد Prisma تشغيل أول k ترحيلاً على قاعدة الظل ويقارن الجداول والأعمدة والأنواع والفهارس والقيود والمفاتيح. إذا كان السجل بادئة كاملة من السلسلة فـ k هو طولها (والباقي يُطبَّق فعلياً)؛ وإلا فأكبر k يطابق. لا تطابق ← رفض مع عرض الفرق.
3. **كائنات SQL** التي لا يراها `migrate diff` (الدوال والمشغّلات والتسلسلات التي تنشئها أول k ترحيلاً) موجودة كلها. أي نقص ← رفض، لأن تلك الترحيلات لم تُطبَّق فعلاً.
4. **خطوات البيانات:** الترحيلات التي ستُسجَّل وفيها `UPDATE/INSERT/DELETE` أو `setval` تُعرض بأسمائها وأوامرها؛ `resolve` لا ينفّذها. `--apply` يرفض ما لم يُمرَّر `--data-steps-reviewed` بعد التحقق على بيانات هذه القاعدة أن كل خطوة منعكسة فيها (مثلاً: تسلسلات أرقام المستندات أكبر من أعلى رقم مستخدم؛ لا صفوف تنتظر الإسناد الذي يؤديه الترحيل).
5. **إعادة فحص التطابق** مباشرة قبل التسجيل.

بعدها: `migrate resolve --applied` لكل ترحيل غير مسجّل حتى k، ثم `migrate deploy` للباقي، ثم التحقق من أن القاعدة تساوي `schema.prisma` وفيها كل كائنات SQL للسلسلة.

### الإجراء

```bash
# 1) نسخة مستعادة (لا تعمل على الإنتاج مباشرة)
pg_dump --no-owner --no-privileges "$PROD_URL" > prod.sql
createdb faramace_restore && psql -v ON_ERROR_STOP=1 faramace_restore < prod.sql
# 2) قاعدة ظل فارغة يحتوي اسمها "shadow" (يمسحها Prisma)
createdb faramace_baseline_shadow
# 3) فحص للقراءة فقط
TARGET_DATABASE_URL=…/faramace_restore SHADOW_DATABASE_URL=…/faramace_baseline_shadow \
  node scripts/baseline-existing-db.mjs --report check.json
# 4) راجع خطوات البيانات المعروضة على بيانات النسخة
# 5) التطبيق على النسخة ثم تشغيل التطبيق عليها
TARGET_DATABASE_URL=…/faramace_restore SHADOW_DATABASE_URL=…/faramace_baseline_shadow \
  node scripts/baseline-existing-db.mjs --apply --data-steps-reviewed --report apply.json
# 6) في نافذة صيانة وبعد نسخة احتياطية جديدة: الخطوات 3–5 على الإنتاج
# 7) بعدها: prisma migrate deploy فقط، ولا db push
```

السكربت لا يقرأ `DATABASE_URL`، ويرفض قاعدة ظل هي نفسها الهدف أو لا يحتوي اسمها `shadow` أو غير فارغة.

### ما يرفضه (ولا يكتب شيئاً)

- قاعدة لا تساوي أي نقطة من السلسلة (مثلاً مخطط أقدم طُبّق بـ `db push`): يُعرض الفرق للمراجعة اليدوية.
- كائن SQL ناقص (مثل مشغّل `sale_invoice_scope`).
- بصمة ترحيل مسجّل تختلف عن ملفه.
- خطوات بيانات لم تُراجع.

## الاختبارات

- `node --test scripts/migrations.test.mjs`: كل ترحيل مثبت بالبصمة، والـ55 القديمة لم تتغير.
- `MIGRATION_TEST_ADMIN_URL=postgresql://…@127.0.0.1:5432/postgres node --test --test-concurrency=1 scripts/migrations.integration.test.mjs` (PostgreSQL محلي فقط؛ قواعد `faramace_migration_test_*` مؤقتة):
  - قاعدة فارغة ← `migrate deploy` ← مطابقة تامة + الدوال والمشغّلات؛ والتهيئة بالترحيلات فقط.
  - ترقية **نسخة مستعادة** (`pg_dump` ← قاعدة جديدة) من: قاعدة عميل بُنيت بـ `db push` بلا سجل؛ قاعدة من التهيئة السابقة (55 مسجّلة)؛ قاعدة بُنيت بالسلسلة حتى ترحيل أقدم. البيانات محفوظة، والمصدر لم يُلمس، والنهاية مطابقة.
  - الرفض دون تغيير في الحالات أعلاه.
- **حدود:** قواعد "العميل" في الاختبار محاكاة (`db push` + كائنات SQL كما بُنيت قواعد الإنتاج)، لا نسخة فعلية من قاعدة عميل. الخطوة 3 أعلاه على نسخة مستعادة حقيقية ضرورية قبل الإنتاج.
