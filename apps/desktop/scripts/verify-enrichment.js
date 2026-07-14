/**
 * verify-enrichment.js — أداة تحقق دائمة (للقراءة فقط)
 * -----------------------------------------------------------------------------
 * تتأكد أن ملف الإثراء (drugs-enrichment-review.xlsx) لم يغيّر بياناتك الأصلية:
 *   - عدد الصفوف مطابق لعدد الأدوية في قاعدة البيانات.
 *   - كل (الاسم التجاري + الباركود) في الملف مطابق حرفياً لما في GlobalDrug.
 *   - لا يوجد باركود في الملف غير موجود في القاعدة، ولا العكس.
 *
 * تعطي أيضاً ملخصاً لنِسب التأكد (كم "متأكد"/"محتمل"/"غير متأكد").
 *
 * التشغيل:  node scripts/verify-enrichment.js
 *           node scripts/verify-enrichment.js path\to\file.xlsx   (لملف بمسار مختلف)
 */
const path = require("path");
const dir = path.join(__dirname, "..");
const { PrismaClient } = require(path.join(dir, "node_modules", ".prisma", "desktop-client"));
process.env.DATABASE_URL = process.env.DATABASE_URL || ("file:" + path.join(dir, "prisma", "local.db"));
const XLSX = require(path.join(dir, "..", "..", "node_modules", "xlsx"));

const prisma = new PrismaClient();
const filePath = process.argv[2] || path.join(dir, "drugs-enrichment-review.xlsx");

(async () => {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  const db = await prisma.globalDrug.findMany({ select: { barcode: true, tradeName: true } });

  const byBar = new Map(db.map(d => [String(d.barcode), d.tradeName]));
  const fileBarcodes = new Set();

  let mismatch = 0, missingInDb = 0;
  for (const r of rows) {
    const bc = String(r["الباركود"]);
    const tn = r["الاسم التجاري"];
    fileBarcodes.add(bc);
    if (!byBar.has(bc)) { missingInDb++; if (missingInDb <= 5) console.log("⚠️ باركود في الملف غير موجود بالقاعدة:", bc); continue; }
    if (byBar.get(bc) !== tn) {
      mismatch++;
      if (mismatch <= 5) console.log("⚠️ اختلاف اسم تجاري:", bc, "| الملف:", JSON.stringify(tn), "| القاعدة:", JSON.stringify(byBar.get(bc)));
    }
  }
  const missingInFile = db.filter(d => !fileBarcodes.has(String(d.barcode))).length;

  // ملخص نِسب التأكد
  const conf = {};
  for (const r of rows) { const c = r["نسبة التأكد (علمي)"] || "—"; conf[c] = (conf[c] || 0) + 1; }

  console.log("\n──────── نتيجة التحقق ────────");
  console.log("الملف:", filePath);
  console.log("صفوف الملف:", rows.length, "| أدوية القاعدة:", db.length);
  console.log("اختلافات (اسم تجاري/باركود):", mismatch);
  console.log("باركود بالملف غير موجود بالقاعدة:", missingInDb);
  console.log("أدوية بالقاعدة مفقودة من الملف:", missingInFile);
  console.log("توزيع نسبة التأكد (علمي):", JSON.stringify(conf, null, 0));
  const ok = mismatch === 0 && missingInDb === 0 && missingInFile === 0 && rows.length === db.length;
  console.log(ok
    ? "\n✅ سليم: الاسم التجاري والباركود مطابقان تماماً لقاعدة البيانات."
    : "\n❌ يوجد اختلاف — راجع التحذيرات أعلاه.");
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
})();
