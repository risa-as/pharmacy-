# Faramace Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-23

## Active Technologies
- TypeScript 5.3+ (all apps) + TailwindCSS v3.4 — all tokens already in `packages/shared`; (002-ui-standardization)
- N/A — no storage changes (002-ui-standardization)
- TypeScript 5.3+ (all apps) + Next.js (App Router), Expo (React Native + NativeWind), Electron + React, Prisma ORM (007-inventory-supplier)
- PostgreSQL (web cloud) + SQLite (desktop local), both managed via Prisma (007-inventory-supplier)

- TypeScript 5.3+ (all apps and packages) (001-design-system)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.3+ (all apps and packages): Follow standard conventions

## Recent Changes
- 007-inventory-supplier: Added TypeScript 5.3+ (all apps) + Next.js (App Router), Expo (React Native + NativeWind), Electron + React, Prisma ORM
- 002-ui-standardization: Added TypeScript 5.3+ (all apps) + TailwindCSS v3.4 — all tokens already in `packages/shared`;

- 001-design-system: Added TypeScript 5.3+ (all apps and packages)

<!-- MANUAL ADDITIONS START -->
<!-- FARAMACE_RELEASE_BRANCH_START -->
## فرع رفع تعديلات النظام والهاتف

توجيه صريح من صاحب النظام بتاريخ 2026-10-15:

- فرع الرفع الموحد هو `codex/release-readiness-fixes` في مستودع `https://github.com/risa-as/pharmacy-.git`، والـ remote هو `origin`.
- عند طلب رفع التعديلات أو نشرها، ارفع تعديلات النظام والهاتف والحزم المشتركة إلى هذا الفرع نفسه، ما لم يحدد صاحب النظام فرعاً آخر صراحةً. لا تطلب اختيار الفرع مجدداً دون سبب جديد.
- لا تنشئ فرع نشر منفصلاً للهاتف، ولا ترفع إلى `codex/mobile-automatic-updates` كخطوة إضافية. إذا احتجت فرع عمل مؤقتاً، يجب إيصال التعديلات المأذون بها إلى فرع الرفع الموحد قبل النشر.
- قبل الرفع، تحقق من الفرع والـ remote، واحفظ تعديلات المستخدم غير المتعلقة بالمهمة. لا تضمّنها في commit المهمة تلقائياً ولا تستبدلها.
- وجهة الرفع هي `git push origin HEAD:refs/heads/codex/release-readiness-fixes`، بعد نجاح الفحوص المناسبة والتأكد أن HEAD يحتوي تغييرات فرع الرفع الموحد.
- مسار تحديث الهاتف هو `.github/workflows/mobile-update.yml`. عند شمول الرفع ملفات الهاتف أو الحزم المشتركة أو مدخلات بنائه، يجب أن ينشر المسار تحديث EAS إلى قناة `production` من الفرع نفسه. تحقق من نجاح مهمة GitHub Actions واذكر رابطها عند الإبلاغ عن النشر.
- حافظ على فحص التوافق الأصلي `scripts/check-mobile-runtime.mjs`. تغييرات المكتبات أو الإعدادات الأصلية تحتاج إصدار تثبيت جديداً؛ لا تدّع أن OTA يحدّث النسخ القديمة غير المهيأة أو يطبّق التحديث فوراً على تطبيق مغلق أو غير متصل بالإنترنت.
<!-- FARAMACE_RELEASE_BRANCH_END -->
<!-- MANUAL ADDITIONS END -->
