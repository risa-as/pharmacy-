const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 بدء إنشاء البيانات التجريبية...\n");

    // 1. إنشاء المنظمة
    console.log("📦 إنشاء المنظمة...");
    const organization = await prisma.organization.create({
        data: {
            name: "صيدلية الشفاء",
        },
    });
    console.log(`   ✓ تم إنشاء: ${organization.name}`);

    // 2. إنشاء الفروع
    console.log("\n🏪 إنشاء الفروع...");
    const branches = await Promise.all([
        prisma.branch.create({
            data: {
                name: "الفرع الرئيسي - بغداد",
                organizationId: organization.id,
            },
        }),
        prisma.branch.create({
            data: {
                name: "فرع الكرادة",
                organizationId: organization.id,
            },
        }),
    ]);
    branches.forEach((b) => console.log(`   ✓ ${b.name}`));

    // 3. إنشاء المستخدمين
    console.log("\n👥 إنشاء المستخدمين...");
    const hashedPassword = await bcrypt.hash("123456", 10);
    const users = await Promise.all([
        prisma.user.create({
            data: {
                email: "admin@faramace.com",
                name: "مدير النظام",
                password: hashedPassword,
                role: "ADMIN",
                branchId: branches[0].id,
            },
        }),
        prisma.user.create({
            data: {
                email: "pharmacist@faramace.com",
                name: "أحمد الصيدلي",
                password: hashedPassword,
                role: "PHARMACIST",
                branchId: branches[0].id,
            },
        }),
        prisma.user.create({
            data: {
                email: "cashier@faramace.com",
                name: "محمد المحاسب",
                password: hashedPassword,
                role: "CASHIER",
                branchId: branches[0].id,
            },
        }),
    ]);
    users.forEach((u) => console.log(`   ✓ ${u.name} (${u.email})`));

    // 4. إنشاء قاعدة الأدوية
    console.log("\n💊 إنشاء قاعدة الأدوية...");
    const drugs = await Promise.all([
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100017",
                tradeName: "بنادول",
                scientificName: "Paracetamol",
                origin: "الإمارات",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100024",
                tradeName: "أموكسيل",
                scientificName: "Amoxicillin",
                origin: "السعودية",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100031",
                tradeName: "فولتارين",
                scientificName: "Diclofenac",
                origin: "سويسرا",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100048",
                tradeName: "أوجمنتين",
                scientificName: "Amoxicillin + Clavulanic Acid",
                origin: "بريطانيا",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100055",
                tradeName: "بروفين",
                scientificName: "Ibuprofen",
                origin: "بريطانيا",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100062",
                tradeName: "زيرتك",
                scientificName: "Cetirizine",
                origin: "بلجيكا",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100079",
                tradeName: "أسبرين",
                scientificName: "Acetylsalicylic Acid",
                origin: "ألمانيا",
                isActive: true,
            },
        }),
        prisma.globalDrug.create({
            data: {
                barcode: "6281001100086",
                tradeName: "ميترونيدازول",
                scientificName: "Metronidazole",
                origin: "الهند",
                isActive: true,
            },
        }),
    ]);
    drugs.forEach((d) => console.log(`   ✓ ${d.tradeName} (${d.barcode})`));

    // 5. إنشاء الموردين
    console.log("\n🚚 إنشاء الموردين...");
    const suppliers = await Promise.all([
        prisma.supplier.create({
            data: {
                name: "شركة الأدوية العراقية",
                email: "info@iraqpharma.com",
                phone: "07701234567",
                address: "بغداد - الكرادة",
            },
        }),
        prisma.supplier.create({
            data: {
                name: "مستودع الشفاء",
                email: "sales@shifa.com",
                phone: "07809876543",
                address: "بغداد - المنصور",
            },
        }),
    ]);
    suppliers.forEach((s) => console.log(`   ✓ ${s.name}`));

    // 6. إنشاء المخزون والدفعات
    console.log("\n📦 إنشاء المخزون...");
    const inventoryItems = await Promise.all(
        drugs.slice(0, 5).map((drug, index) =>
            prisma.inventory.create({
                data: {
                    branchId: branches[0].id,
                    drugId: drug.id,
                    price: 5000 + index * 2000,
                    cost: 3000 + index * 1500,
                    minStock: 10,
                    maxStock: 100,
                    batches: {
                        create: {
                            batchNumber: `LOT${2024}${String(index + 1).padStart(4, "0")}`,
                            quantity: 50 + index * 10,
                            expiryDate: new Date(2026, 6 + index, 1),
                        },
                    },
                },
            })
        )
    );
    console.log(`   ✓ تم إنشاء ${inventoryItems.length} عناصر مخزون مع دفعات`);

    // 7. إنشاء المرضى
    console.log("\n👤 إنشاء المرضى...");
    const patients = await Promise.all([
        prisma.patient.create({
            data: {
                name: "علي أحمد محمد",
                phone: "07712345678",
                gender: "male",
                dateOfBirth: new Date(1985, 5, 15),
                allergies: ["بنسلين"],
                chronicDiseases: ["سكري"],
                notes: "يحتاج متابعة دورية",
            },
        }),
        prisma.patient.create({
            data: {
                name: "فاطمة حسن علي",
                phone: "07823456789",
                gender: "female",
                dateOfBirth: new Date(1990, 2, 20),
                allergies: [],
                chronicDiseases: ["ضغط الدم"],
            },
        }),
        prisma.patient.create({
            data: {
                name: "محمد كريم جاسم",
                phone: "07934567890",
                gender: "male",
                dateOfBirth: new Date(1978, 8, 10),
                allergies: ["أسبرين", "سلفا"],
                chronicDiseases: [],
            },
        }),
    ]);
    patients.forEach((p) => console.log(`   ✓ ${p.name} (${p.phone})`));

    // 8. إنشاء شركات التأمين
    console.log("\n🏥 إنشاء شركات التأمين...");
    const insuranceCompanies = await Promise.all([
        prisma.insuranceCompany.create({
            data: {
                name: "التأمين الوطني العراقي",
                discountRate: 15,
                contactPhone: "07801111111",
                contactEmail: "info@nic.iq",
            },
        }),
        prisma.insuranceCompany.create({
            data: {
                name: "شركة الخليج للتأمين",
                discountRate: 20,
                contactPhone: "07802222222",
                contactEmail: "info@gulf.iq",
            },
        }),
    ]);
    insuranceCompanies.forEach((c) => console.log(`   ✓ ${c.name} (خصم ${c.discountRate}%)`));

    // 9. إضافة بوليصة تأمين للمريض الأول
    console.log("\n📋 إنشاء بوليصات التأمين...");
    await prisma.insurancePolicy.create({
        data: {
            patientId: patients[0].id,
            companyId: insuranceCompanies[0].id,
            policyNumber: "NIC-2024-00001",
            coverageRate: 80,
            expiryDate: new Date(2026, 11, 31),
        },
    });
    console.log("   ✓ تم ربط التأمين بالمريض الأول");

    // 10. إنشاء وصفة تجريبية
    console.log("\n📝 إنشاء وصفة طبية تجريبية...");
    await prisma.prescription.create({
        data: {
            patientId: patients[0].id,
            doctorName: "د. أحمد خالد",
            clinicName: "مستشفى بغداد التعليمي",
            status: "PENDING",
            items: {
                create: [
                    {
                        drugId: drugs[0].id,
                        quantity: 2,
                        dosage: "حبة واحدة كل 8 ساعات",
                        instructions: "بعد الأكل",
                    },
                    {
                        drugId: drugs[1].id,
                        quantity: 1,
                        dosage: "كبسولة كل 12 ساعة",
                        instructions: "لمدة 7 أيام",
                    },
                ],
            },
        },
    });
    console.log("   ✓ تم إنشاء وصفة طبية للمريض الأول");

    // 11. إنشاء إعدادات الشركة (مهم جداً)
    console.log("\n⚙️ إنشاء إعدادات الشركة...");
    await prisma.companySettings.create({
        data: {
            name: "صيدلية فاراماس النموذجية",
            phone: "07700000000",
            address: "بغداد - الكرادة - شارع 62",
            currency: "IQD",
            email: "contact@faramace-demo.com",
            website: "www.faramace.com",
        }
    });
    console.log("   ✓ تم إنشاء الإعدادات الافتراضية");

    // 12. إنشاء مبيعات ومصروفات (للتقارير)
    console.log("\n💰 إنشاء بيانات مالية للتقارير (آخر 30 يوم)...");

    const today = new Date();
    const salesData = [];
    const expensesData = [];

    // دالة مساعدة لإنشاء تاريخ عشوائي في آخر 30 يوم
    const getRandomDate = (start, end) => {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    };

    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(today.getDate() - 30);

    // إنشاء 50 عملية بيع عشوائية
    for (let i = 0; i < 50; i++) {
        const saleDate = getRandomDate(oneMonthAgo, today);
        const randomUser = users[Math.floor(Math.random() * users.length)]; // Random user (Admin/Pharmacist/Cashier)
        const randomTotal = Math.floor(Math.random() * 50000) + 5000; // 5k to 55k

        salesData.push({
            branchId: branches[0].id,
            userId: randomUser.id, // Link to user for performance reports
            patientId: Math.random() > 0.7 ? patients[0].id : null, // 30% chance of linking to patient
            total: randomTotal,
            createdAt: saleDate,
            items: {
                create: [
                    {
                        drugId: drugs[0].id,
                        quantity: Math.floor(Math.random() * 3) + 1,
                        price: 1000
                    }
                ]
            },
            payment: {
                create: {
                    amount: randomTotal,
                    method: ["CASH", "CARD", "ZAIN_CASH"][Math.floor(Math.random() * 3)],
                    status: "COMPLETED"
                }
            }
        });
    }

    // إنشاء 10 مصروفات عشوائية
    for (let i = 0; i < 10; i++) {
        const expenseDate = getRandomDate(oneMonthAgo, today);
        expensesData.push({
            branchId: branches[0].id,
            category: ["إيجار", "كهرباء", "رواتب", "نثرية"][Math.floor(Math.random() * 4)],
            amount: Math.floor(Math.random() * 100000) + 25000,
            description: "مصروف تجريبي",
            date: expenseDate,
        });
    }

    // حفظ المبيعات
    for (const sale of salesData) {
        await prisma.sale.create({ data: sale });
    }

    // حفظ المصروفات
    for (const expense of expensesData) {
        await prisma.expense.create({ data: expense });
    }

    console.log(`   ✓ تم إنشاء ${salesData.length} عملية بيع و ${expensesData.length} مصروف`);

    console.log("\n✅ تم إنشاء جميع البيانات التجريبية بنجاح!");
    console.log("\n📋 ملخص:");
    console.log(`   • المنظمات: 1`);
    console.log(`   • الفروع: ${branches.length}`);
    console.log(`   • المستخدمين: ${users.length}`);
    console.log(`   • الأدوية: ${drugs.length}`);
    console.log(`   • الموردين: ${suppliers.length}`);
    console.log(`   • المخزون: ${inventoryItems.length}`);
    console.log(`   • المرضى: ${patients.length}`);
    console.log(`   • شركات التأمين: ${insuranceCompanies.length}`);
    console.log(`   • المبيعات: ${salesData.length}`);
    console.log(`   • المصروفات: ${expensesData.length}`);
    console.log("\n🔐 بيانات تسجيل الدخول:");
    console.log("   البريد: admin@faramace.com");
    console.log("   كلمة المرور: 123456");
}

main()
    .catch((e) => {
        console.error("❌ خطأ:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
