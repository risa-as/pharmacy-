/**
 * enrich-drugs.js — أداة إثراء (للمراجعة فقط، لا تعدّل قاعدة البيانات)
 * -----------------------------------------------------------------------------
 * تقرأ كل الأدوية من قاعدة البيانات المحلية (GlobalDrug) وتحاول استنتاج:
 *   - الاسم العلمي (scientificName) + نسبة التأكد
 *   - بلد المنشأ (origin)        + نسبة التأكد
 * ثم تصدّر ملف Excel للمراجعة من قبل صيدلي قبل أي تحديث فعلي.
 *
 * المبدأ:
 *   1) كشف اسم علمي مضمَّن: إن احتوى الاسم التجاري اسماً علمياً معروفاً (INN)
 *      مثل "Ceftriaxone BP 1g" → Ceftriaxone  → نسبة تأكد "متأكد".
 *   2) قاموس علامات تجارية معروفة: "Risperdal" → Risperidone (USA) → "متأكد".
 *   3) لا تطابق واثق → يُترك الاسم العلمي فارغاً ونسبة التأكد "غير متأكد"
 *      (الفراغ أأمن من تخمين خاطئ في نظام طبي).
 *
 * التشغيل:  node scripts/enrich-drugs.js
 * الناتج:   drugs-enrichment-review.xlsx (في جذر apps/desktop)
 */
const path = require("path");
const fs = require("fs");

const dir = path.join(__dirname, "..");
const { PrismaClient } = require(path.join(dir, "node_modules", ".prisma", "desktop-client"));
process.env.DATABASE_URL = process.env.DATABASE_URL || ("file:" + path.join(dir, "prisma", "local.db"));
// xlsx متوفرة في node_modules بجذر المشروع
const XLSX = require(path.join(dir, "..", "..", "node_modules", "xlsx"));

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────────────────
// معجم الأسماء العلمية (INN) — للكشف عن اسم علمي مضمَّن داخل الاسم التجاري.
// يشمل الأدوية الـ254 التي يعتمدها محرك التفاعلات + شائعات إضافية.
// ──────────────────────────────────────────────────────────────────────────
const INN = [
  // مسكنات/مضادات التهاب
  "Paracetamol","Acetaminophen","Aspirin","Ibuprofen","Naproxen","Diclofenac","Meloxicam","Celecoxib","Indomethacin","Ketoprofen","Mefenamic Acid","Piroxicam","Etoricoxib","Tenoxicam","Lornoxicam","Aceclofenac","Sulindac","Nabumetone","Ketorolac","Dexketoprofen","Flurbiprofen",
  // مضادات تخثر/صفائح
  "Warfarin","Clopidogrel","Ticagrelor","Prasugrel","Dipyridamole","Cilostazol","Ticlopidine","Rivaroxaban","Apixaban","Dabigatran","Enoxaparin","Heparin",
  // ضغط/قلب
  "Lisinopril","Enalapril","Captopril","Ramipril","Perindopril","Benazepril","Fosinopril","Quinapril","Trandolapril","Moexipril",
  "Losartan","Valsartan","Candesartan","Telmisartan","Irbesartan","Olmesartan","Eprosartan","Azilsartan",
  "Spironolactone","Eplerenone","Amiloride","Triamterene",
  "Amlodipine","Nifedipine","Felodipine","Diltiazem","Verapamil","Nicardipine","Lercanidipine","Lacidipine",
  "Atenolol","Metoprolol","Bisoprolol","Propranolol","Carvedilol","Nebivolol","Labetalol","Timolol",
  "Furosemide","Hydrochlorothiazide","Indapamide","Bumetanide","Torsemide","Chlortalidone",
  "Digoxin","Amiodarone","Sotalol","Ivabradine","Nitroglycerin","Isosorbide Mononitrate","Isosorbide Dinitrate","Trimetazidine",
  // ستاتينات/دهون
  "Simvastatin","Atorvastatin","Rosuvastatin","Lovastatin","Pravastatin","Fluvastatin","Pitavastatin","Ezetimibe","Fenofibrate","Gemfibrozil",
  // سكري
  "Metformin","Glibenclamide","Glimepiride","Gliclazide","Glipizide","Sitagliptin","Vildagliptin","Linagliptin","Saxagliptin","Empagliflozin","Dapagliflozin","Canagliflozin","Pioglitazone","Insulin","Liraglutide","Repaglinide","Acarbose",
  // نفسية/أعصاب
  "Fluoxetine","Paroxetine","Sertraline","Citalopram","Escitalopram","Fluvoxamine","Venlafaxine","Duloxetine","Desvenlafaxine","Mirtazapine","Bupropion","Trazodone","Vortioxetine",
  "Amitriptyline","Clomipramine","Imipramine","Nortriptyline","Doxepin","Desipramine","Trimipramine","Protriptyline",
  "Phenelzine","Tranylcypromine","Selegiline","Isocarboxazid","Moclobemide","Rasagiline","Linezolid",
  "Olanzapine","Risperidone","Quetiapine","Clozapine","Aripiprazole","Haloperidol","Chlorpromazine","Fluphenazine","Perphenazine","Prochlorperazine","Ziprasidone","Paliperidone","Sulpiride","Amisulpride",
  "Diazepam","Alprazolam","Lorazepam","Clonazepam","Bromazepam","Chlordiazepoxide","Midazolam","Temazepam","Nitrazepam","Oxazepam","Triazolam","Zolpidem","Eszopiclone","Buspirone",
  "Carbamazepine","Phenytoin","Phenobarbital","Valproic Acid","Sodium Valproate","Gabapentin","Pregabalin","Topiramate","Lamotrigine","Levetiracetam","Oxcarbazepine","Lacosamide",
  "Levodopa","Pramipexole","Ropinirole","Donepezil","Memantine","Rivastigmine","Betahistine","Flunarizine","Cinnarizine",
  // أفيونات/مهدئات عضلية
  "Morphine","Codeine","Tramadol","Oxycodone","Hydrocodone","Fentanyl","Methadone","Pethidine","Buprenorphine","Tapentadol","Tizanidine","Baclofen","Cyclobenzaprine","Orphenadrine","Chlorzoxazone","Thiocolchicoside",
  // مضادات حيوية
  "Amoxicillin","Ampicillin","Penicillin","Cloxacillin","Flucloxacillin","Piperacillin","Cefalexin","Cephalexin","Cefuroxime","Cefixime","Cefdinir","Cefpodoxime","Ceftriaxone","Cefotaxime","Ceftazidime","Cefaclor","Cefazolin","Cefepime",
  "Azithromycin","Clarithromycin","Erythromycin","Roxithromycin","Spiramycin",
  "Ciprofloxacin","Levofloxacin","Moxifloxacin","Ofloxacin","Norfloxacin","Gemifloxacin",
  "Doxycycline","Tetracycline","Minocycline","Tigecycline",
  "Gentamicin","Amikacin","Tobramycin",
  "Metronidazole","Tinidazole","Clindamycin","Vancomycin","Linezolid","Nitrofurantoin","Fosfomycin","Trimethoprim","Sulfamethoxazole","Chloramphenicol","Rifampicin","Rifaximin",
  // فطريات/فيروسات/طفيليات
  "Fluconazole","Itraconazole","Ketoconazole","Voriconazole","Posaconazole","Terbinafine","Nystatin","Clotrimazole","Miconazole","Griseofulvin",
  "Acyclovir","Valacyclovir","Oseltamivir","Albendazole","Mebendazole","Ivermectin","Praziquantel","Chloroquine","Hydroxychloroquine","Artemether","Lumefantrine",
  // جهاز هضمي
  "Omeprazole","Esomeprazole","Lansoprazole","Pantoprazole","Rabeprazole","Ranitidine","Famotidine","Domperidone","Metoclopramide","Ondansetron","Granisetron","Hyoscine","Mebeverine","Loperamide","Lactulose","Bisacodyl","Sucralfate","Simethicone","Mesalazine","Ursodeoxycholic Acid",
  // تنفسي/حساسية
  "Salbutamol","Albuterol","Salmeterol","Formoterol","Budesonide","Fluticasone","Beclometasone","Montelukast","Ipratropium","Tiotropium","Theophylline","Aminophylline","Ambroxol","Bromhexine","Acetylcysteine","Carbocisteine","Guaifenesin","Dextromethorphan",
  "Loratadine","Desloratadine","Cetirizine","Levocetirizine","Fexofenadine","Diphenhydramine","Chlorpheniramine","Promethazine","Hydroxyzine","Cyproheptadine","Meclizine","Dimenhydrinate","Ketotifen","Bilastine","Ebastine",
  // كورتيزون/هرمونات/غدد
  "Prednisolone","Prednisone","Methylprednisolone","Dexamethasone","Betamethasone","Hydrocortisone","Triamcinolone","Levothyroxine","Carbimazole","Methimazole","Propylthiouracil",
  // مسالك/تضخم بروستات/ضعف انتصاب
  "Tamsulosin","Alfuzosin","Doxazosin","Terazosin","Silodosin","Finasteride","Dutasteride","Sildenafil","Tadalafil","Vardenafil","Avanafil","Solifenacin","Oxybutynin","Tolterodine","Mirabegron",
  // عيون
  "Latanoprost","Timolol","Brimonidine","Dorzolamide","Brinzolamide","Tobramycin","Moxifloxacin","Olopatadine",
  // فيتامينات/مكملات شائعة
  "Biotin","Folic Acid","Vitamin D3","Cholecalciferol","Vitamin C","Ascorbic Acid","Vitamin B12","Cyanocobalamin","Melatonin","Omega 3","Calcium Carbonate","Ferrous Sulfate","Ferrous Fumarate","Zinc Sulfate","Magnesium","Coenzyme Q10","Myo-Inositol","Glucosamine","Collagen",
  // أخرى مهمة للتفاعلات
  "Lithium","Methotrexate","Colchicine","Allopurinol","Febuxostat","Cyclosporine","Tacrolimus","Azathioprine","Pentoxifylline","Sumatriptan","Zolmitriptan","Rizatriptan",
];

// قاموس علامات تجارية معروفة → { sci, origin }  (origin قد يكون null إن غير مؤكد)
const BRANDS = {
  "panadol": { sci: "Paracetamol", origin: "United Kingdom" },
  "adol": { sci: "Paracetamol", origin: "Saudi Arabia" },
  "tylenol": { sci: "Paracetamol", origin: "USA" },
  "brufen": { sci: "Ibuprofen", origin: "United Kingdom" },
  "advil": { sci: "Ibuprofen", origin: "USA" },
  "voltaren": { sci: "Diclofenac", origin: "Switzerland" },
  "cataflam": { sci: "Diclofenac", origin: "Switzerland" },
  "augmentin": { sci: "Amoxicillin/Clavulanate", origin: "United Kingdom" },
  "klacid": { sci: "Clarithromycin", origin: "USA" },
  "zithromax": { sci: "Azithromycin", origin: "USA" },
  "ciprobay": { sci: "Ciprofloxacin", origin: "Germany" },
  "tavanic": { sci: "Levofloxacin", origin: "France" },
  "flagyl": { sci: "Metronidazole", origin: "France" },
  "risperdal": { sci: "Risperidone", origin: "Belgium" },
  "zyprexa": { sci: "Olanzapine", origin: "USA" },
  "seroquel": { sci: "Quetiapine", origin: "United Kingdom" },
  "actos": { sci: "Pioglitazone", origin: "Japan" },
  "glucophage": { sci: "Metformin", origin: "France" },
  "januvia": { sci: "Sitagliptin", origin: "USA" },
  "galvus": { sci: "Vildagliptin", origin: "Switzerland" },
  "jardiance": { sci: "Empagliflozin", origin: "Germany" },
  "forxiga": { sci: "Dapagliflozin", origin: "United Kingdom" },
  "lipitor": { sci: "Atorvastatin", origin: "USA" },
  "crestor": { sci: "Rosuvastatin", origin: "United Kingdom" },
  "concor": { sci: "Bisoprolol", origin: "Germany" },
  "norvasc": { sci: "Amlodipine", origin: "USA" },
  "exforge": { sci: "Amlodipine/Valsartan", origin: "Switzerland" },
  "co-diovan": { sci: "Valsartan/Hydrochlorothiazide", origin: "Switzerland" },
  "diovan": { sci: "Valsartan", origin: "Switzerland" },
  "xalatan": { sci: "Latanoprost", origin: "USA" },
  "laritin": { sci: "Loratadine", origin: null },
  "claritine": { sci: "Loratadine", origin: "Belgium" },
  "zyrtec": { sci: "Cetirizine", origin: "Switzerland" },
  "telfast": { sci: "Fexofenadine", origin: "France" },
  "nexium": { sci: "Esomeprazole", origin: "Sweden" },
  "losec": { sci: "Omeprazole", origin: "Sweden" },
  "motilium": { sci: "Domperidone", origin: "Belgium" },
  "zofran": { sci: "Ondansetron", origin: "United Kingdom" },
  "ventolin": { sci: "Salbutamol", origin: "United Kingdom" },
  "singulair": { sci: "Montelukast", origin: "USA" },
  "lyrica": { sci: "Pregabalin", origin: "USA" },
  "pregafix": { sci: "Pregabalin", origin: null },
  "neurontin": { sci: "Gabapentin", origin: "USA" },
  "tegretol": { sci: "Carbamazepine", origin: "Switzerland" },
  "depakine": { sci: "Sodium Valproate", origin: "France" },
  "keppra": { sci: "Levetiracetam", origin: "Belgium" },
  "tramal": { sci: "Tramadol", origin: "Germany" },
  "scopinal": { sci: "Hyoscine Butylbromide", origin: null },
  "buscopan": { sci: "Hyoscine Butylbromide", origin: "Germany" },
  "duphalac": { sci: "Lactulose", origin: "Netherlands" },
  "omega": { sci: "Omega 3", origin: null },
  "biotin": { sci: "Biotin", origin: null },
};

// كلمات تُحذف عند التطبيع (جرعات/أشكال صيدلانية/وحدات/كلمات تسويقية)
const NOISE = new Set([
  "tab","tabs","tablet","tablets","cap","caps","capsule","capsules","syr","syrup","susp","suspension",
  "cream","creem","oint","ointment","gel","drop","drops","spray","amp","ampoule","vial","sachet","sachets",
  "inj","injection","im","iv","sc","sr","xr","mr","cr","od","bp","usp","ph","eur","forte","plus","extra","new","co",
  "mg","mcg","g","gm","ml","iu","ui","msg","l","percent","kit","pen","susp","eye","ear","nasal","vaginal","rectal",
  "for","with","women","men","kids","baby","adult","strong","double","fort","retard",
]);

function normalize(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")           // إزالة ما بين الأقواس
    .replace(/[0-9]+([.,][0-9]+)?/g, " ")  // إزالة الأرقام
    .replace(/[%\/\\+\-.,:;|]/g, " ")      // إزالة الرموز
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(norm) {
  return norm.split(" ").filter(t => t && !NOISE.has(t));
}

// معجم مطبّع للبحث السريع
const innNorm = INN.map(s => ({ sci: s, norm: normalize(s) }));

function detect(tradeName) {
  const norm = normalize(tradeName);
  const toks = tokens(norm);
  const tokSet = new Set(toks);

  // 1) علامة تجارية معروفة (أعلى ثقة)
  for (const t of toks) {
    if (BRANDS[t]) return { sci: BRANDS[t].sci, sciConf: "متأكد", origin: BRANDS[t].origin || "", originConf: BRANDS[t].origin ? "متأكد" : "غير متأكد", source: "brand" };
  }
  const firstWord = toks[0];
  if (firstWord && BRANDS[firstWord]) {
    const b = BRANDS[firstWord];
    return { sci: b.sci, sciConf: "متأكد", origin: b.origin || "", originConf: b.origin ? "متأكد" : "غير متأكد", source: "brand" };
  }

  // 2) اسم علمي مضمَّن — تطابق كلمة كاملة (ثقة عالية)
  let best = null;
  for (const e of innNorm) {
    const innToks = e.norm.split(" ").filter(Boolean);
    if (innToks.length === 1) {
      if (tokSet.has(e.norm)) { if (!best || e.norm.length > best.len) best = { sci: e.sci, len: e.norm.length, exact: true }; }
    } else {
      // اسم علمي مركّب: تأكد من وجود كل كلماته متتابعة
      if ((" " + toks.join(" ") + " ").includes(" " + e.norm + " ")) {
        if (!best || e.norm.length > best.len) best = { sci: e.sci, len: e.norm.length, exact: true };
      }
    }
  }
  if (best) return { sci: best.sci, sciConf: "متأكد", origin: "", originConf: "غير متأكد", source: "inn-token" };

  // 3) تطابق جزئي (بادئة) — ثقة منخفضة (محتمل)
  for (const e of innNorm) {
    if (e.norm.length >= 6) {
      for (const t of toks) {
        if (t.length >= 6 && (t.startsWith(e.norm.slice(0, 6)) || e.norm.startsWith(t.slice(0, 6)))) {
          return { sci: e.sci, sciConf: "محتمل", origin: "", originConf: "غير متأكد", source: "inn-prefix" };
        }
      }
    }
  }

  // 4) لا تطابق واثق
  return { sci: "", sciConf: "غير متأكد", origin: "", originConf: "غير متأكد", source: "none" };
}

(async () => {
  const rows = await prisma.globalDrug.findMany({
    select: { id: true, barcode: true, tradeName: true, scientificName: true, origin: true },
    orderBy: { tradeName: "asc" },
  });

  const out = [];
  const stats = { brand: 0, "inn-token": 0, "inn-prefix": 0, none: 0 };
  for (const r of rows) {
    const d = detect(r.tradeName);
    stats[d.source]++;
    out.push({
      "الاسم التجاري": r.tradeName,
      "الباركود": r.barcode,
      "الاسم العلمي المقترح": d.sci,
      "نسبة التأكد (علمي)": d.sciConf,
      "بلد المنشأ المقترح": d.origin,
      "نسبة التأكد (المنشأ)": d.originConf,
      "الاسم العلمي الحالي": r.scientificName,
      "بحاجة لمراجعة": d.sciConf === "متأكد" ? "لا" : "نعم",
    });
  }

  const ws = XLSX.utils.json_to_sheet(out);
  ws["!cols"] = [{ wch: 38 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Drugs");
  const outPath = path.join(dir, "drugs-enrichment-review.xlsx");
  XLSX.writeFile(wb, outPath);

  console.log("\n✅ تم إنشاء الملف:", outPath);
  console.log("إجمالي الأدوية:", rows.length);
  console.log("نتائج الكشف:");
  console.log("  علامة تجارية معروفة (متأكد):", stats.brand);
  console.log("  اسم علمي مضمَّن (متأكد):     ", stats["inn-token"]);
  console.log("  تطابق جزئي (محتمل):          ", stats["inn-prefix"]);
  console.log("  غير متأكد (يحتاج صيدلي):     ", stats.none);
  const confident = stats.brand + stats["inn-token"];
  console.log(`نسبة الثقة العالية: ${((confident / rows.length) * 100).toFixed(1)}%`);
  await prisma.$disconnect();
})();
