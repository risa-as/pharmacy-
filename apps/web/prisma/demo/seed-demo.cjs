// Demo data for screenshots and sales demos: «صيدلية التفوق» and «مذخر التفوق».
// Every name, phone and email is fictional. See README.md in this folder before running.
// Run from apps/web:  node prisma/demo/seed-demo.cjs

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
let seed = 20260928;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const DAY = 86400000;
const NOW = Date.now();
// Never in the future: a same-day time later than now is pulled back to a minute ago.
const daysAgo = (d, h = 12, m = 0) => { const t = new Date(NOW - d * DAY); t.setHours(h, m, 0, 0); return t.getTime() > NOW ? new Date(NOW - 60000 - Math.floor(rnd() * 3 * 3600000)) : t; };
const inDays = (d) => new Date(NOW + d * DAY);
const round250 = (v) => Math.round(v / 250) * 250;

// [tradeName, scientificName, price (IQD per unit), origin]
const DRUGS = [
  ['Panadol Extra', 'Paracetamol 500mg + Caffeine 65mg', 2500, 'إيرلندا'],
  ['Brufen 400', 'Ibuprofen 400mg', 3000, 'المملكة المتحدة'],
  ['Augmentin 1g', 'Amoxicillin + Clavulanic Acid', 11000, 'المملكة المتحدة'],
  ['Amoxil 500', 'Amoxicillin 500mg', 4500, 'السعودية'],
  ['Omeprazole 20', 'Omeprazole 20mg', 3500, 'الأردن'],
  ['Nexium 40', 'Esomeprazole 40mg', 14000, 'السويد'],
  ['Zyrtec 10', 'Cetirizine 10mg', 4000, 'بلجيكا'],
  ['Claritine', 'Loratadine 10mg', 4500, 'بلجيكا'],
  ['Concor 5', 'Bisoprolol 5mg', 7500, 'ألمانيا'],
  ['Amlor 5', 'Amlodipine 5mg', 6000, 'فرنسا'],
  ['Glucophage 850', 'Metformin 850mg', 5000, 'فرنسا'],
  ['Januvia 100', 'Sitagliptin 100mg', 32000, 'الولايات المتحدة'],
  ['Lipitor 20', 'Atorvastatin 20mg', 18000, 'الولايات المتحدة'],
  ['Crestor 10', 'Rosuvastatin 10mg', 21000, 'المملكة المتحدة'],
  ['Aspirin Protect 100', 'Acetylsalicylic Acid 100mg', 3000, 'ألمانيا'],
  ['Plavix 75', 'Clopidogrel 75mg', 24000, 'فرنسا'],
  ['Voltaren 50', 'Diclofenac Sodium 50mg', 4000, 'سويسرا'],
  ['Cataflam 50', 'Diclofenac Potassium 50mg', 4500, 'سويسرا'],
  ['Flagyl 500', 'Metronidazole 500mg', 3000, 'فرنسا'],
  ['Cipro 500', 'Ciprofloxacin 500mg', 6500, 'ألمانيا'],
  ['Zithromax 500', 'Azithromycin 500mg', 9000, 'الولايات المتحدة'],
  ['Ventolin Inhaler', 'Salbutamol 100mcg', 6000, 'المملكة المتحدة'],
  ['Symbicort 160', 'Budesonide + Formoterol', 38000, 'السويد'],
  ['Otrivin 0.1%', 'Xylometazoline', 3500, 'سويسرا'],
  ['Strepsils', 'Amylmetacresol + Dichlorobenzyl', 3000, 'المملكة المتحدة'],
  ['Vitamin D3 50000', 'Cholecalciferol', 8000, 'الأردن'],
  ['Neurobion', 'Vitamin B1 + B6 + B12', 5500, 'ألمانيا'],
  ['Ferrous Sulfate', 'Iron 200mg', 2500, 'الهند'],
  ['Folic Acid 5', 'Folic Acid 5mg', 1500, 'الهند'],
  ['Buscopan 10', 'Hyoscine Butylbromide', 4000, 'ألمانيا'],
  ['Motilium 10', 'Domperidone 10mg', 4500, 'بلجيكا'],
  ['Imodium', 'Loperamide 2mg', 3500, 'بلجيكا'],
  ['Eltroxin 50', 'Levothyroxine 50mcg', 4000, 'المملكة المتحدة'],
  ['Lasix 40', 'Furosemide 40mg', 2500, 'ألمانيا'],
  ['Diamicron MR 60', 'Gliclazide 60mg', 9500, 'فرنسا'],
  ['Xarelto 20', 'Rivaroxaban 20mg', 45000, 'ألمانيا'],
  ['Fucidin Cream', 'Fusidic Acid 2%', 5000, 'الدنمارك'],
  ['Betadine Solution', 'Povidone Iodine 10%', 4000, 'قبرص'],
  ['Gaviscon Liquid', 'Sodium Alginate', 7000, 'المملكة المتحدة'],
  ['Mebo Ointment', 'Beta-sitosterol', 8500, 'الإمارات'],
];

const FIRST = ['أحمد', 'محمد', 'علي', 'حسين', 'زينب', 'فاطمة', 'مريم', 'عمر', 'يوسف', 'نور', 'سجى', 'حيدر', 'رسل', 'كرار', 'آية', 'مصطفى'];
const LAST = ['الجبوري', 'العبيدي', 'الربيعي', 'الساعدي', 'التميمي', 'الخفاجي', 'الدليمي', 'الزبيدي', 'الموسوي', 'الشمري'];
const person = () => `${pick(FIRST)} ${pick(LAST)}`;
const phone = () => `07${pick(['70', '71', '80', '81', '50'])}0${int(100000, 999999)}`;

async function main() {
  const [{ current_database: db }] = await prisma.$queryRaw`select current_database()`;
  const expected = process.env.DEMO_DATABASE_NAME || 'faramace_demo';
  if (db !== expected) throw new Error(`Refusing to seed database ${db} (expected ${expected})`);
  if (await prisma.organization.count()) throw new Error(`${db} is not empty: the demo seed runs only on a fresh database`);

  const pw = process.env.SEED_USER_PASSWORD;
  if (!pw || pw.length < 12) throw new Error('Set SEED_USER_PASSWORD');
  const hash = await bcrypt.hash(pw, 10);

  const plan = await prisma.subscriptionPlan.findFirst({ where: { name: 'احترافي' } });
  const enterprise = await prisma.subscriptionPlan.findFirst({ where: { name: 'مؤسسات' } });
  if (!plan || !enterprise) throw new Error('Run seed-plans first');

  // ── Pharmacy ─────────────────────────────────────────────
  const org = await prisma.organization.create({
    data: { name: 'صيدلية التفوق', planId: enterprise.id, subscriptionEndsAt: inDays(240), loyaltyEnabled: true },
  });
  await prisma.companySettings.create({
    data: { organizationId: org.id, name: 'صيدلية التفوق', phone: '07700000100', address: 'بغداد - المنصور، شارع 14 رمضان', loyaltyEnabled: true },
  });
  const main = await prisma.branch.create({ data: { name: 'الفرع الرئيسي - المنصور', organizationId: org.id } });
  const second = await prisma.branch.create({ data: { name: 'فرع الكرادة', organizationId: org.id } });

  const admin = await prisma.user.create({ data: { email: 'admin@altafawuq.test', name: 'د. علي حسن', role: 'ADMIN', branchId: main.id, password: hash } });
  const pharmacist = await prisma.user.create({ data: { email: 'pharmacist@altafawuq.test', name: 'د. سارة محمود', role: 'PHARMACIST', branchId: main.id, password: hash } });
  const cashier = await prisma.user.create({ data: { email: 'cashier@altafawuq.test', name: 'مصطفى كريم', role: 'CASHIER', branchId: main.id, password: hash } });
  const cashier2 = await prisma.user.create({ data: { email: 'karrada@altafawuq.test', name: 'نور الهدى جاسم', role: 'CASHIER', branchId: second.id, password: hash } });

  const safe = await prisma.safe.create({ data: { name: 'صندوق الكاشير', branchId: main.id, balance: 1850000 } });
  const safe2 = await prisma.safe.create({ data: { name: 'صندوق الكاشير', branchId: second.id, balance: 640000 } });
  await prisma.safe.create({ data: { name: 'الخزنة الرئيسية', type: 'VAULT', branchId: main.id, balance: 7250000 } });

  // ── Warehouse ────────────────────────────────────────────
  const wh = await prisma.warehouse.create({
    data: {
      name: 'مذخر التفوق', code: 'TFQ', city: 'بغداد', address: 'شارع الصناعة - مجمع الأدوية',
      phone: '07700000200', salesPhone: '07700000201', contactPerson: 'قسم المبيعات',
      email: 'sales@altafawuq-wh.test', operatingMode: 'FULL',
    },
  });
  await prisma.user.create({ data: { email: 'owner@altafawuq-wh.test', name: 'إدارة مذخر التفوق', role: 'WAREHOUSE', warehouseUserType: 'OWNER', warehouseId: wh.id, password: hash } });
  await prisma.user.create({ data: { email: 'sales@altafawuq-wh.test', name: 'حسن فاضل', role: 'WAREHOUSE', warehouseUserType: 'SALES', warehouseId: wh.id, password: hash } });

  // ── Drugs, inventory, batches ────────────────────────────
  const drugs = [];
  for (let i = 0; i < DRUGS.length; i++) {
    const [tradeName, scientificName, price, origin] = DRUGS[i];
    const d = await prisma.globalDrug.create({
      data: { barcode: `62${String(9000000000 + i * 7919).padStart(11, '0')}`, tradeName, scientificName, origin, unitsPerPack: pick([10, 20, 30, 1]) },
    });
    drugs.push({ ...d, price, cost: round250(price * (0.68 + rnd() * 0.1)) });
  }

  const suppliers = [];
  suppliers.push(await prisma.supplier.create({ data: { name: 'مذخر التفوق', organizationId: org.id, warehouseId: wh.id, phone: '07700000200', balance: 1325000 } }));
  suppliers.push(await prisma.supplier.create({ data: { name: 'شركة النهرين لتوزيع الأدوية', organizationId: org.id, phone: '07800000300', balance: 480000 } }));
  suppliers.push(await prisma.supplier.create({ data: { name: 'مذخر الواحة', organizationId: org.id, phone: '07500000400', balance: 0 } }));

  const invByBranch = { [main.id]: [], [second.id]: [] };
  for (const [bi, branch] of [main, second].entries()) {
    for (let i = 0; i < drugs.length; i++) {
      const d = drugs[i];
      if (bi === 1 && i % 3 === 2) continue;
      const inv = await prisma.inventory.create({
        data: { branchId: branch.id, drugId: d.id, price: d.price, cost: d.cost, minStock: pick([10, 15, 20, 30]), maxStock: 300, isQuickSale: i < 6 },
      });
      // Stock profile: a few low, a few expiring soon, one expired
      let batches;
      if (i % 11 === 4) batches = [[int(2, 6), 200]];              // low stock
      else if (i % 9 === 3) batches = [[int(25, 60), int(20, 60)], [int(40, 90), 420]]; // expiring soon
      else if (i === 18 && bi === 0) batches = [[6, -12], [60, 380]]; // one expired batch
      else batches = [[int(40, 160), int(250, 600)], ...(rnd() > 0.5 ? [[int(20, 80), int(500, 800)]] : [])];
      for (const [qty, expDays] of batches) {
        await prisma.batch.create({
          data: {
            inventoryId: inv.id, quantity: qty, initialQuantity: qty + int(10, 80), costPrice: d.cost,
            batchNumber: `${String.fromCharCode(65 + (i % 26))}${int(10000, 99999)}`, expiryDate: inDays(expDays),
            // Batches expiring within 30 days (the app's «قريب الانتهاء») and the expired one lead the batches table.
            supplierId: pick(suppliers).id, createdAt: expDays <= 30 ? new Date(NOW - int(1, 40) * 3600000) : daysAgo(int(20, 120)),
          },
        });
      }
      invByBranch[branch.id].push({ inv, d });
    }
  }

  // ── Patients ─────────────────────────────────────────────
  const patients = [];
  for (let i = 0; i < 18; i++) {
    patients.push(await prisma.patient.create({
      data: {
        name: person(), phone: phone(), branchId: i < 14 ? main.id : second.id,
        chronicDiseases: i % 4 === 0 ? ['سكري النوع الثاني'] : i % 5 === 0 ? ['ضغط الدم'] : [],
        allergies: i % 7 === 0 ? ['البنسلين'] : [],
        createdAt: daysAgo(int(30, 200)),
      },
    }));
  }

  // ── Sales (last 30 days) ─────────────────────────────────
  const creditTotals = new Map();
  const recentSales = []; // for returns and repayments below
  let saleCount = 0;
  for (let day = 29; day >= 0; day--) {
    for (const [branch, users, sf] of [[main, [cashier, pharmacist, admin], safe], [second, [cashier2], safe2]]) {
      const weekend = new Date(NOW - day * DAY).getDay() === 5;
      const n = branch === main ? int(weekend ? 10 : 18, weekend ? 16 : 30) : int(6, 14);
      const pool = invByBranch[branch.id];
      for (let s = 0; s < n; s++) {
        if (day === 0 && s > n * 0.6) break;
        const lines = [];
        const count = pick([1, 1, 2, 2, 2, 3, 4]);
        for (let k = 0; k < count; k++) {
          const { d } = pool[Math.floor(Math.pow(rnd(), 1.6) * pool.length)];
          if (lines.some((l) => l.drugId === d.id)) continue;
          lines.push({ drugId: d.id, quantity: pick([1, 1, 1, 2, 2, 3]), price: d.price, cost: d.cost });
        }
        const total = lines.reduce((a, l) => a + l.price * l.quantity, 0);
        const credit = rnd() < 0.07;
        const patient = credit || rnd() < 0.2 ? pick(patients.filter((p) => p.branchId === branch.id)) : null;
        const discount = rnd() < 0.1 ? round250(total * 0.05) : 0;
        const method = credit ? 'CREDIT' : rnd() < 0.18 ? 'CARD' : 'CASH';
        const at = daysAgo(day, int(9, 22), int(0, 59));
        const sale = await prisma.sale.create({
          data: {
            branchId: branch.id, safeId: method === 'CASH' ? sf.id : null, patientId: patient?.id ?? null,
            userId: pick(users).id, total: total - discount, discount, createdAt: at, updatedAt: at,
            items: { create: lines },
            payment: { create: { amount: total - discount, method, status: credit ? 'PENDING' : 'COMPLETED', createdAt: at } },
          },
        });
        if (credit && patient) creditTotals.set(patient.id, (creditTotals.get(patient.id) ?? 0) + total - discount);
        if (day <= 12) recentSales.push({ id: sale.id, branchId: branch.id, userId: sale.userId, safeId: sf.id, lines, total: total - discount, credit, patientId: patient?.id ?? null, at });
        saleCount++;
      }
    }
  }
  // Returns: a few partial ones and one full return, on recent cash sales.
  const cashSales = recentSales.filter((x) => !x.credit && x.lines.length >= 2);
  const RETURN_NOTES = ['تحسس من الدواء', 'صرف دواء بديل من الطبيب', 'علبة تالفة', null, 'إلغاء الوصفة'];
  for (let r = 0; r < 5 && r < cashSales.length; r++) {
    const sale = cashSales[r * 3];
    if (!sale) break;
    const full = r === 2;
    const items = (full ? sale.lines : [sale.lines[0]]).map((l) => ({ drugId: l.drugId, quantity: l.quantity, price: l.price, stockStatus: 'RESTOCKED' }));
    const amount = full ? sale.total : items.reduce((a, i) => a + i.price * i.quantity, 0);
    const at = new Date(Math.min(NOW - 60000, sale.at.getTime() + int(2, 30) * 3600000));
    await prisma.saleReturn.create({
      data: { saleId: sale.id, branchId: sale.branchId, userId: sale.userId, safeId: sale.safeId, total: amount, notes: RETURN_NOTES[r], createdAt: at, items: { create: items } },
    });
  }

  // Debt repayments on credit sales, lowering the patients' balances.
  const creditSales = recentSales.filter((x) => x.credit && x.patientId);
  for (let k = 0; k < 6 && k < creditSales.length; k++) {
    const sale = creditSales[k];
    const amount = round250(sale.total * (k % 2 === 0 ? 1 : 0.5));
    await prisma.debtPayment.create({
      data: { saleId: sale.id, userId: sale.userId, amount, method: k % 3 === 2 ? 'ZAIN_CASH' : 'CASH', note: k % 2 === 0 ? 'تسديد كامل' : 'دفعة جزئية', createdAt: new Date(Math.min(NOW - 60000, sale.at.getTime() + int(24, 96) * 3600000)) },
    });
    creditTotals.set(sale.patientId, Math.max(0, (creditTotals.get(sale.patientId) ?? 0) - amount));
  }
  for (const [id, bal] of creditTotals) await prisma.patient.update({ where: { id }, data: { balance: bal } });

  // ── Expenses & purchases ─────────────────────────────────
  for (const [cat, desc, amt, d] of [
    ['Rent', 'إيجار شهر أيلول', 750000, 27], ['Utilities', 'فاتورة المولدة الأهلية', 225000, 20],
    ['Salaries', 'رواتب الموظفين', 1200000, 25], ['Utilities', 'إنترنت', 60000, 12], ['Maintenance', 'صيانة جهاز التبريد', 90000, 6], ['Supplies', 'أكياس ومستلزمات تغليف', 35000, 0],
  ]) await prisma.expense.create({ data: { branchId: main.id, safeId: safe.id, category: cat, description: desc, amount: amt, date: daysAgo(d), createdAt: daysAgo(d) } });

  // The last purchase is today's, so the dashboard's «مشتريات اليوم» is not empty.
  for (let p = 0; p < 7; p++) {
    const items = Array.from({ length: int(3, 7) }, () => { const d = pick(drugs); return { drugId: d.id, quantity: pick([20, 30, 50, 100]), cost: d.cost, expiryDate: inDays(int(300, 700)), batchNumber: `P${int(10000, 99999)}` }; })
      .filter((v, i, a) => a.findIndex((x) => x.drugId === v.drugId) === i);
    const total = items.reduce((a, it) => a + it.quantity * it.cost, 0);
    await prisma.purchase.create({
      data: { supplierId: suppliers[p % 2 === 0 ? 1 : 2].id, branchId: main.id, total, paidAmount: p < 4 ? total : Math.round(total / 2), status: 'COMPLETED', invoiceNumber: `INV-${4410 + p}`, createdAt: p === 6 ? daysAgo(0, 10, 15) : daysAgo(4 + p * 5), items: { create: items } },
    });
  }

  // ── Warehouse catalog, customers, orders ─────────────────
  const catalog = [];
  for (let i = 0; i < drugs.length; i++) {
    const d = drugs[i];
    const pack = d.unitsPerPack ?? 1;
    catalog.push(await prisma.warehouseCatalogItem.create({
      data: {
        warehouseId: wh.id, drugId: d.id, barcode: d.barcode, price: round250(d.cost * pack * 0.97), costPrice: round250(d.cost * pack * 0.85),
        isAvailable: i % 13 !== 7, minStock: 20, bonusThreshold: i % 5 === 0 ? 10 : 0, bonusQuantity: i % 5 === 0 ? 1 : 0, unitsPerPack: pack,
      },
    }));
  }

  // Other pharmacies ordering from the warehouse (fictional)
  const buyers = [{ org, branch: main }];
  for (const [name, area] of [['صيدلية النخيل', 'زيونة'], ['صيدلية دجلة', 'الأعظمية'], ['صيدلية الحياة', 'اليرموك'], ['صيدلية الفرات', 'الكاظمية']]) {
    const o = await prisma.organization.create({ data: { name, planId: plan.id, subscriptionEndsAt: inDays(180) } });
    const b = await prisma.branch.create({ data: { name: `الفرع الرئيسي - ${area}`, organizationId: o.id } });
    buyers.push({ org: o, branch: b });
  }
  for (const [i, b] of buyers.entries()) {
    await prisma.warehouseCustomer.create({ data: { warehouseId: wh.id, organizationId: b.org.id, creditLimit: [10000000, 5000000, 3000000, 0, 4000000][i], paymentTermDays: [30, 15, 30, 0, 15][i], openingBalance: 0 } });
  }

  const FLOW = ['SENT', 'UNDER_REVIEW', 'QUOTED', 'APPROVED', 'SHIPPED', 'DELIVERED'];
  const orderPlan = [
    [0, 'QUOTED', 0], [1, 'SENT', 0], [2, 'UNDER_REVIEW', 0], [0, 'SHIPPED', 1], [3, 'APPROVED', 1], [4, 'SENT', 0],
    [0, 'DELIVERED', 4], [1, 'DELIVERED', 6], [2, 'QUOTED', 1], [3, 'DELIVERED', 9], [4, 'REJECTED', 3], [0, 'DELIVERED', 12],
  ];
  let invSeq = 1;
  for (const [bi, status, age] of orderPlan) {
    const buyer = buyers[bi];
    const chosen = [];
    while (chosen.length < int(4, 8)) { const c = pick(catalog); if (!chosen.includes(c)) chosen.push(c); }
    const quoted = !['SENT', 'UNDER_REVIEW'].includes(status);
    const created = daysAgo(age, int(8, 11), int(0, 59));
    const items = chosen.map((c, k) => {
      const qty = pick([5, 10, 10, 20, 30]);
      const out = quoted && k === 2 && !c.isAvailable;
      const bonus = quoted && c.bonusThreshold && qty >= c.bonusThreshold ? Math.floor(qty / c.bonusThreshold) * c.bonusQuantity : 0;
      return {
        drugId: c.drugId, quantity: qty, unitPrice: quoted ? c.price : 0, requestedPrice: null,
        quotedPrice: quoted ? c.price : null, quotedQuantity: quoted ? (out ? 0 : qty) : null,
        status: quoted ? (out ? 'OUT_OF_STOCK' : 'AVAILABLE') : 'REQUESTED', bonusQuantity: bonus, unitsPerPack: c.unitsPerPack,
        batchNumber: quoted && !out ? `W${int(10000, 99999)}` : null, expiryDate: quoted && !out ? inDays(int(400, 800)) : null,
      };
    });
    const totalAmount = quoted ? items.reduce((a, it) => a + (it.quotedPrice ?? 0) * (it.quotedQuantity ?? 0), 0) : 0;
    const order = await prisma.warehouseOrder.create({
      data: { warehouseId: wh.id, branchId: buyer.branch.id, status, totalAmount, createdAt: created, updatedAt: created, items: { create: items } },
    });
    const steps = status === 'REJECTED' ? ['SENT', 'UNDER_REVIEW', 'REJECTED'] : FLOW.slice(0, FLOW.indexOf(status) + 1);
    let t = created.getTime();
    for (const st of steps) {
      const pharmacySide = ['SENT', 'APPROVED'].includes(st);
      await prisma.warehouseOrderEvent.create({
        data: { orderId: order.id, type: st, actorType: pharmacySide ? 'PHARMACY' : 'WAREHOUSE', actorName: pharmacySide ? `إدارة ${buyer.org.name}` : 'حسن فاضل', createdAt: new Date(t) },
      });
      t += int(25, 180) * 60000;
    }
    if (['APPROVED', 'SHIPPED', 'DELIVERED'].includes(status)) {
      const paid = status === 'DELIVERED' && age > 8 ? totalAmount : status === 'DELIVERED' ? Math.round(totalAmount / 2) : 0;
      await prisma.warehouseInvoice.create({
        data: {
          warehouseId: wh.id, organizationId: buyer.org.id, orderId: order.id, invoiceNumber: `TFQ-${String(invSeq++).padStart(5, '0')}`,
          total: totalAmount, paidAmount: paid, status: paid === 0 ? 'UNPAID' : paid < totalAmount ? 'PARTIAL' : 'PAID',
          issuedAt: created, dueAt: new Date(created.getTime() + 30 * DAY),
        },
      });
    }
  }

  // ── Notifications ────────────────────────────────────────
  for (const [type, title, body, d] of [
    ['EXPIRY', 'دفعات قريبة من الانتهاء', '4 دفعات تنتهي خلال 60 يوماً', 0],
    ['LOW_STOCK', 'نقص في المخزون', '3 أصناف وصلت إلى حد إعادة الطلب', 0],
    ['SYSTEM', 'عرض سعر جديد', 'مذخر التفوق أرسل عرض سعر لطلبك', 0],
    ['NEW_PURCHASE', 'استلام فاتورة شراء', 'تم استلام فاتورة من شركة النهرين', 1],
  ]) await prisma.notification.create({ data: { branchId: main.id, type, title, body, createdAt: daysAgo(d, 9) } });

  console.log(JSON.stringify({ db, drugs: drugs.length, sales: saleCount, orders: orderPlan.length }));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
