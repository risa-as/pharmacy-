/* =============================================================================
   بذر بيانات تجريبية لميزة المذاخر (المرحلة 2) — Faramace
   يُشغَّل يدوياً بعد تطبيق الترحيلات فقط:
     npx ts-node --compiler-options "{\"module\":\"commonjs\"}" prisma/seed-warehouse-demo.ts

   ينشئ (upsert آمن للتكرار):
     - مذخراً تجريبياً «مذخر النور التجريبي» + حساب WAREHOUSE (OWNER) بلا branchId
     - 5 أدوية عالمية (organizationId: null) بباركودات فريدة
     - كتالوج المذخر للأدوية الخمسة
     - منظمة صيدلية تجريبية + فرع + صنف خاص يحمل نفس باركود أحد الأدوية العالمية
       (لتجربة المطابقة عبر المستأجرين — معيار القبول 3-ب في التقرير)
   ============================================================================= */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// باركودات ثابتة لضمان تكرارية البذر (idempotent)
const BARCODES = {
  panadol: "WM-DEMO-0001",
  brufen: "WM-DEMO-0002",
  augmentin: "WM-DEMO-0003",
  omeprazole: "WM-DEMO-0004",
  cetirizine: "WM-DEMO-0005",
} as const;

async function main() {
  console.log("🌱 بذر بيانات المذاخر التجريبية...\n");

  const password = await bcrypt.hash("R$i1999s$a", 10);

  // 1) المذخر التجريبي
  const warehouse = await prisma.warehouse.upsert({
    where: { code: "WM-DEMO" },
    update: { isActive: true },
    create: {
      name: "مذخر النور التجريبي",
      code: "WM-DEMO",
      phone: "07700000001",
      city: "بغداد",
      address: "شارع الصناعة - مجمع الأدوية",
      contactPerson: "أبو أحمد",
      email: "demo-warehouse@faramace.test",
      isActive: true,
    },
  });
  console.log("✅ المذخر:", warehouse.name, warehouse.id);

  // 2) حساب صاحب المذخر — بلا branchId ولا organizationId
  const whUser = await prisma.user.upsert({
    where: { email: "warehouse-demo@faramace.test" },
    update: { warehouseId: warehouse.id, role: "WAREHOUSE", warehouseUserType: "OWNER" },
    create: {
      name: "صاحب مذخر النور (تجريبي)",
      email: "warehouse-demo@faramace.test",
      password,
      role: "WAREHOUSE",
      warehouseUserType: "OWNER",
      warehouseId: warehouse.id,
    },
  });
  console.log("✅ حساب المذخر:", whUser.email, "role:", whUser.role);

  // 3) أدوية عالمية (organizationId: null)
  const globalDrugs: Record<keyof typeof BARCODES, { id: string; name: string; sci: string }> =
    {} as any;

  const defs: Array<[keyof typeof BARCODES, string, string]> = [
    ["panadol", "بانادول اكسترا (عالمي)", "Paracetamol + Caffeine"],
    ["brufen", "بروفين 400 (عالمي)", "Ibuprofen"],
    ["augmentin", "أوجمنتين 1g (عالمي)", "Amoxicillin + Clavulanic"],
    ["omeprazole", "أوميبرازول 20 (عالمي)", "Omeprazole"],
    ["cetirizine", "سيتيريزين 10 (عالمي)", "Cetirizine"],
  ];

  for (const [key, tradeName, sci] of defs) {
    const barcode = BARCODES[key];
    const existing = await prisma.globalDrug.findFirst({
      where: { barcode, organizationId: null },
    });
    const drug =
      existing ??
      (await prisma.globalDrug.create({
        data: { barcode, tradeName, scientificName: sci, organizationId: null },
      }));
    globalDrugs[key] = { id: drug.id, name: tradeName, sci };
    console.log("✅ دواء عالمي:", tradeName, barcode);
  }

  // 4) كتالوج المذخر
  const catalogPrices: Record<keyof typeof BARCODES, number> = {
    panadol: 1250,
    brufen: 900,
    augmentin: 5500,
    omeprazole: 2000,
    cetirizine: 750,
  };

  for (const key of Object.keys(BARCODES) as Array<keyof typeof BARCODES>) {
    const barcode = BARCODES[key];
    const existing = await prisma.warehouseCatalogItem.findUnique({
      where: { warehouseId_barcode: { warehouseId: warehouse.id, barcode } },
    });
    if (existing) {
      await prisma.warehouseCatalogItem.update({
        where: { id: existing.id },
        data: { price: catalogPrices[key], isAvailable: true, drugId: globalDrugs[key].id },
      });
    } else {
      await prisma.warehouseCatalogItem.create({
        data: {
          warehouseId: warehouse.id,
          drugId: globalDrugs[key].id,
          barcode,
          price: catalogPrices[key],
          isAvailable: true,
        },
      });
    }
    console.log("✅ كتالوج:", globalDrugs[key].name, "→", catalogPrices[key], "د.ع");
  }

  // 5) منظمة صيدلية تجريبية + فرع + صنف خاص بنفس باركود البانادول العالمي
  const org = await prisma.organization.upsert({
    where: { id: "seed-wh-demo-org" },
    update: {},
    create: { id: "seed-wh-demo-org", name: "صيدلية المذاخر التجريبية" },
  });
  const branch = await prisma.branch.upsert({
    where: { id: "seed-wh-demo-branch" },
    update: {},
    create: { id: "seed-wh-demo-branch", name: "فرع الكرادة (تجريبي)", organizationId: org.id },
  });
  const admin = await prisma.user.upsert({
    where: { email: "pharmacy-demo@faramace.test" },
    update: { branchId: branch.id },
    create: {
      name: "مدير الصيدلية التجريبية",
      email: "pharmacy-demo@faramace.test",
      password,
      role: "ADMIN",
      branchId: branch.id,
    },
  });

  const privatePanadol = await prisma.globalDrug.findFirst({
    where: { barcode: BARCODES.panadol, organizationId: org.id },
  });
  if (!privatePanadol) {
    await prisma.globalDrug.create({
      data: {
        barcode: BARCODES.panadol,
        tradeName: "بانادول اكسترا (نسخة الصيدلية)",
        scientificName: "Paracetamol + Caffeine",
        organizationId: org.id,
      },
    });
  }
  console.log("✅ منظمة + فرع + حساب:", org.name, branch.name, admin.email);
  console.log("✅ صنف خاص بنفس باركود الصنف العالمي (لتجربة المطابقة عبر المستأجرين):", BARCODES.panadol);

  console.log("\n🏁 اكتمل البذر التجريبي. استخدم حساب المذخر لتجربة بوابة المذخر بعد المرحلة 3.");
}

main()
  .catch((e) => {
    console.error("❌ فشل البذر:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
