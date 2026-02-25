
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 بدء ملء قاعدة البيانات بالبيانات الافتراضية...\n');

    const password = await bcrypt.hash('123456', 10);

    // ==================== 1. Organization ====================
    const org = await prisma.organization.create({
        data: {
            id: 'org-1',
            name: 'مجموعة صيدليات فاراماس',
        },
    });
    console.log('✅ تم إنشاء المؤسسة:', org.name);

    // ==================== 2. Branches ====================
    const branch1 = await prisma.branch.create({
        data: {
            id: 'branch-1',
            name: 'الفرع الرئيسي - بغداد',
            organizationId: org.id,
        },
    });
    const branch2 = await prisma.branch.create({
        data: {
            id: 'branch-2',
            name: 'فرع الكرادة',
            organizationId: org.id,
        },
    });
    console.log('✅ تم إنشاء الفروع:', branch1.name, '|', branch2.name);

    // ==================== 3. Users ====================
    const admin = await prisma.user.create({
        data: {
            name: 'رعد المدير',
            email: 'raad@faramace.com',
            password,
            role: 'ADMIN',
            branchId: branch1.id,
        },
    });
    const pharmacist1 = await prisma.user.create({
        data: {
            name: 'أحمد الصيدلي',
            email: 'ahmed@faramace.com',
            password,
            role: 'PHARMACIST',
            branchId: branch1.id,
        },
    });
    const pharmacist2 = await prisma.user.create({
        data: {
            name: 'سارة الصيدلانية',
            email: 'sara@faramace.com',
            password,
            role: 'PHARMACIST',
            branchId: branch2.id,
        },
    });
    const cashier = await prisma.user.create({
        data: {
            name: 'علي الكاشير',
            email: 'cashier@faramace.com',
            password,
            role: 'CASHIER',
            branchId: branch1.id,
        },
    });
    console.log('✅ تم إنشاء 4 مستخدمين (كلمة السر: 123456)');
    console.log('   📧 raad@faramace.com (ADMIN)');
    console.log('   📧 ahmed@faramace.com (PHARMACIST)');
    console.log('   📧 sara@faramace.com (PHARMACIST)');
    console.log('   📧 cashier@faramace.com (CASHIER)');

    // ==================== 4. Global Drugs ====================
    const drugs = await Promise.all([
        prisma.globalDrug.create({ data: { id: 'd1', barcode: '6281100210016', tradeName: 'Panadol Extra', scientificName: 'Paracetamol 500mg + Caffeine', origin: 'UK', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd2', barcode: '6281100210023', tradeName: 'Amoxil 500', scientificName: 'Amoxicillin 500mg', origin: 'UAE', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd3', barcode: '6281100210030', tradeName: 'Brufen 400', scientificName: 'Ibuprofen 400mg', origin: 'Germany', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd4', barcode: '6281100210047', tradeName: 'Voltaren 50', scientificName: 'Diclofenac Sodium 50mg', origin: 'Switzerland', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd5', barcode: '6281100210054', tradeName: 'Augmentin 1g', scientificName: 'Amoxicillin + Clavulanic Acid', origin: 'France', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd6', barcode: '6281100210061', tradeName: 'Omeprazole 20', scientificName: 'Omeprazole 20mg', origin: 'India', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd7', barcode: '6281100210078', tradeName: 'Metformin 500', scientificName: 'Metformin HCl 500mg', origin: 'Jordan', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd8', barcode: '6281100210085', tradeName: 'Amlodipine 5', scientificName: 'Amlodipine Besylate 5mg', origin: 'India', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd9', barcode: '6281100210092', tradeName: 'Lipitor 20', scientificName: 'Atorvastatin 20mg', origin: 'USA', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd10', barcode: '6281100210108', tradeName: 'Nexium 40', scientificName: 'Esomeprazole 40mg', origin: 'Sweden', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd11', barcode: '6281100210115', tradeName: 'Crestor 10', scientificName: 'Rosuvastatin 10mg', origin: 'UK', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd12', barcode: '6281100210122', tradeName: 'Flagyl 500', scientificName: 'Metronidazole 500mg', origin: 'France', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd13', barcode: '6281100210139', tradeName: 'Cipro 500', scientificName: 'Ciprofloxacin 500mg', origin: 'Germany', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd14', barcode: '6281100210146', tradeName: 'Aspirin 100', scientificName: 'Acetylsalicylic Acid 100mg', origin: 'Germany', isActive: true } }),
        prisma.globalDrug.create({ data: { id: 'd15', barcode: '6281100210153', tradeName: 'Ventolin Inhaler', scientificName: 'Salbutamol 100mcg', origin: 'UK', isActive: true } }),
    ]);
    console.log(`✅ تم إنشاء ${drugs.length} دواء`);

    // ==================== 5. Inventory + Batches ====================
    const inventoryData = [
        { drugId: 'd1', price: 2500, cost: 1500, qty: 200 },
        { drugId: 'd2', price: 5000, cost: 3000, qty: 150 },
        { drugId: 'd3', price: 3000, cost: 1800, qty: 180 },
        { drugId: 'd4', price: 4000, cost: 2500, qty: 120 },
        { drugId: 'd5', price: 12000, cost: 8000, qty: 80 },
        { drugId: 'd6', price: 3500, cost: 2000, qty: 250 },
        { drugId: 'd7', price: 2000, cost: 1200, qty: 300 },
        { drugId: 'd8', price: 4500, cost: 2800, qty: 160 },
        { drugId: 'd9', price: 15000, cost: 10000, qty: 60 },
        { drugId: 'd10', price: 18000, cost: 12000, qty: 40 },
        { drugId: 'd11', price: 12000, cost: 8500, qty: 70 },
        { drugId: 'd12', price: 3000, cost: 1800, qty: 200 },
        { drugId: 'd13', price: 6000, cost: 3500, qty: 100 },
        { drugId: 'd14', price: 1500, cost: 800, qty: 400 },
        { drugId: 'd15', price: 8000, cost: 5500, qty: 50 },
    ];

    // Branch 1 — all drugs
    for (const item of inventoryData) {
        await prisma.inventory.create({
            data: {
                branchId: branch1.id,
                drugId: item.drugId,
                price: item.price,
                cost: item.cost,
                minStock: 10,
                batches: {
                    create: [
                        { batchNumber: `B1-${item.drugId}`, expiryDate: new Date('2027-06-30'), quantity: Math.floor(item.qty * 0.6) },
                        { batchNumber: `B2-${item.drugId}`, expiryDate: new Date('2027-12-31'), quantity: Math.floor(item.qty * 0.4) },
                    ],
                },
            },
        });
    }

    // Branch 2 — first 8 drugs
    for (const item of inventoryData.slice(0, 8)) {
        await prisma.inventory.create({
            data: {
                branchId: branch2.id,
                drugId: item.drugId,
                price: item.price,
                cost: item.cost,
                minStock: 5,
                batches: {
                    create: {
                        batchNumber: `B1-${item.drugId}-K`,
                        expiryDate: new Date('2027-09-30'),
                        quantity: Math.floor(item.qty * 0.5),
                    },
                },
            },
        });
    }

    // Add some near-expiry batches for testing expiry report
    await prisma.inventory.create({
        data: {
            branchId: branch1.id,
            drugId: 'd1',
            price: 2500,
            cost: 1500,
            minStock: 10,
        },
    }).catch(() => { /* already exists, ignore */ });

    // Add near-expiry batches to existing inventory
    const inv1 = await prisma.inventory.findFirst({ where: { branchId: branch1.id, drugId: 'd3' } });
    if (inv1) {
        await prisma.batch.create({
            data: { inventoryId: inv1.id, batchNumber: 'EXPIRING-SOON', expiryDate: new Date('2026-03-01'), quantity: 15 },
        });
    }
    const inv2 = await prisma.inventory.findFirst({ where: { branchId: branch1.id, drugId: 'd6' } });
    if (inv2) {
        await prisma.batch.create({
            data: { inventoryId: inv2.id, batchNumber: 'EXPIRED-BATCH', expiryDate: new Date('2026-01-15'), quantity: 8 },
        });
    }

    console.log('✅ تم إنشاء المخزون والدفعات لكلا الفرعين');

    // ==================== 6. Suppliers ====================
    const suppliers = await Promise.all([
        prisma.supplier.create({ data: { name: 'شركة الحكمة للأدوية', phone: '07801234567', email: 'info@hikma.com', address: 'بغداد - الكرادة' } }),
        prisma.supplier.create({ data: { name: 'شركة سامراء للأدوية', phone: '07801234568', email: 'info@samarra-pharma.com', address: 'سامراء' } }),
        prisma.supplier.create({ data: { name: 'مخازن الرافدين الطبية', phone: '07801234569', email: 'info@rafidain-med.com', address: 'بغداد - الأعظمية' } }),
    ]);
    console.log(`✅ تم إنشاء ${suppliers.length} مورد`);

    // ==================== 7. Patients ====================
    const patients = await Promise.all([
        prisma.patient.create({ data: { name: 'محمد علي حسين', phone: '07901234567', gender: 'male', dateOfBirth: new Date('1985-03-15'), allergies: ['Penicillin'], chronicDiseases: ['Diabetes'] } }),
        prisma.patient.create({ data: { name: 'فاطمة أحمد', phone: '07901234568', gender: 'female', dateOfBirth: new Date('1990-07-22'), allergies: [], chronicDiseases: ['Hypertension'] } }),
        prisma.patient.create({ data: { name: 'عباس كريم', phone: '07901234569', gender: 'male', dateOfBirth: new Date('1975-11-08'), allergies: ['Aspirin', 'Sulfa'], chronicDiseases: ['Diabetes', 'Heart Disease'] } }),
        prisma.patient.create({ data: { name: 'زينب محمد', phone: '07901234570', gender: 'female', dateOfBirth: new Date('1995-01-30'), allergies: [], chronicDiseases: [] } }),
        prisma.patient.create({ data: { name: 'حسن جعفر', phone: '07901234571', gender: 'male', dateOfBirth: new Date('1968-09-12'), allergies: [], chronicDiseases: ['Cholesterol', 'Hypertension'] } }),
    ]);
    console.log(`✅ تم إنشاء ${patients.length} مريض`);

    // ==================== 8. Sample Sales ====================
    const salesData = [
        { patientIdx: 0, userId: admin.id, items: [{ drugId: 'd1', qty: 2, price: 2500 }, { drugId: 'd6', qty: 1, price: 3500 }] },
        { patientIdx: 1, userId: pharmacist1.id, items: [{ drugId: 'd5', qty: 1, price: 12000 }, { drugId: 'd3', qty: 3, price: 3000 }] },
        { patientIdx: 2, userId: pharmacist1.id, items: [{ drugId: 'd7', qty: 2, price: 2000 }, { drugId: 'd8', qty: 1, price: 4500 }, { drugId: 'd14', qty: 2, price: 1500 }] },
        { patientIdx: 3, userId: cashier.id, items: [{ drugId: 'd2', qty: 1, price: 5000 }] },
        { patientIdx: 4, userId: admin.id, items: [{ drugId: 'd9', qty: 1, price: 15000 }, { drugId: 'd11', qty: 1, price: 12000 }] },
        { patientIdx: 0, userId: pharmacist1.id, items: [{ drugId: 'd4', qty: 2, price: 4000 }, { drugId: 'd12', qty: 1, price: 3000 }] },
        { patientIdx: 1, userId: cashier.id, items: [{ drugId: 'd10', qty: 1, price: 18000 }] },
        { patientIdx: null, userId: pharmacist1.id, items: [{ drugId: 'd1', qty: 3, price: 2500 }, { drugId: 'd3', qty: 2, price: 3000 }] },
        { patientIdx: null, userId: admin.id, items: [{ drugId: 'd13', qty: 1, price: 6000 }, { drugId: 'd15', qty: 1, price: 8000 }] },
        { patientIdx: 2, userId: pharmacist2.id, items: [{ drugId: 'd1', qty: 5, price: 2500 }, { drugId: 'd6', qty: 3, price: 3500 }] },
    ];

    for (let i = 0; i < salesData.length; i++) {
        const sd = salesData[i];
        const total = sd.items.reduce((s, item) => s + item.qty * item.price, 0);
        const daysAgo = Math.floor(Math.random() * 25);
        const saleDate = new Date();
        saleDate.setDate(saleDate.getDate() - daysAgo);

        await prisma.sale.create({
            data: {
                branchId: i < 7 ? branch1.id : branch2.id,
                patientId: sd.patientIdx !== null ? patients[sd.patientIdx].id : null,
                userId: sd.userId,
                total,
                createdAt: saleDate,
                items: {
                    create: sd.items.map((item) => ({
                        drugId: item.drugId,
                        quantity: item.qty,
                        price: item.price,
                    })),
                },
                payment: {
                    create: {
                        amount: total,
                        method: i % 3 === 0 ? 'CASH' : i % 3 === 1 ? 'ZAIN_CASH' : 'CARD',
                        status: 'COMPLETED',
                    },
                },
            },
        });
    }
    console.log(`✅ تم إنشاء ${salesData.length} عملية بيع`);

    // ==================== 9. Sample Expenses ====================
    const expenseCategories = [
        { category: 'إيجار', amount: 500000 },
        { category: 'رواتب', amount: 1500000 },
        { category: 'كهرباء', amount: 150000 },
        { category: 'صيانة', amount: 75000 },
        { category: 'إنترنت', amount: 50000 },
    ];

    for (const exp of expenseCategories) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() - Math.floor(Math.random() * 20));
        await prisma.expense.create({
            data: {
                branchId: branch1.id,
                amount: exp.amount,
                category: exp.category,
                description: `${exp.category} شهر فبراير 2026`,
                date: expDate,
            },
        });
    }
    console.log('✅ تم إنشاء 5 مصروفات');

    // ==================== 10. Company Settings ====================
    await prisma.companySettings.create({
        data: {
            name: 'صيدلية فاراماس',
            phone: '07801234560',
            address: 'بغداد - شارع فلسطين',
            email: 'info@faramace.com',
            currency: 'IQD',
            loyaltyEnabled: true,
            loyaltyPointsPerDinar: 0.01,
            loyaltyRedemptionValue: 2.5,
            loyaltyMinRedemption: 500,
        },
    });
    console.log('✅ تم إنشاء إعدادات الشركة (برنامج الولاء مفعّل)');

    // ==================== 11. Sample Purchases ====================
    await prisma.purchase.create({
        data: {
            branchId: branch1.id,
            supplierId: suppliers[0].id,
            total: 2500000,
            status: 'COMPLETED',
            invoiceNumber: 'INV-2026-001',
            items: {
                create: [
                    { drugId: 'd1', quantity: 200, cost: 1500 },
                    { drugId: 'd2', quantity: 100, cost: 3000 },
                    { drugId: 'd5', quantity: 50, cost: 8000 },
                ],
            },
        },
    });
    await prisma.purchase.create({
        data: {
            branchId: branch1.id,
            supplierId: suppliers[1].id,
            total: 750000,
            status: 'PENDING',
            invoiceNumber: 'INV-2026-002',
            items: {
                create: [
                    { drugId: 'd9', quantity: 30, cost: 10000 },
                    { drugId: 'd10', quantity: 25, cost: 12000 },
                ],
            },
        },
    });
    console.log('✅ تم إنشاء 2 فاتورة شراء');

    // ==================== 12. Sample Loyalty Accounts ====================
    for (let i = 0; i < 3; i++) {
        const pts = [1200, 800, 350][i];
        const lifetime = [2500, 1800, 350][i];
        const tier = lifetime >= 5000 ? 'SILVER' : 'BRONZE';

        await prisma.loyaltyAccount.create({
            data: {
                patientId: patients[i].id,
                totalPoints: pts,
                lifetimePoints: lifetime,
                tier,
                transactions: {
                    create: [
                        { type: 'EARN', points: lifetime, description: `نقاط ترحيبية + مشتريات سابقة` },
                        ...(lifetime > pts ? [{ type: 'REDEEM' as const, points: -(lifetime - pts), description: `استبدال ${lifetime - pts} نقطة بخصم` }] : []),
                    ],
                },
            },
        });
    }
    console.log('✅ تم إنشاء 3 حسابات ولاء');

    console.log('\n🎉 تمت عملية الملء بنجاح! قاعدة البيانات جاهزة للاستخدام.\n');
    console.log('📋 ملخص الحسابات:');
    console.log('   ─────────────────────────────────────');
    console.log('   raad@faramace.com     | كلمة السر: 123456 | ADMIN');
    console.log('   ahmed@faramace.com    | كلمة السر: 123456 | PHARMACIST');
    console.log('   sara@faramace.com     | كلمة السر: 123456 | PHARMACIST');
    console.log('   cashier@faramace.com  | كلمة السر: 123456 | CASHIER');
    console.log('   ─────────────────────────────────────\n');
}

main()
    .catch((e) => {
        console.error('❌ حدث خطأ:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
