const { PrismaClient } = require('../node_modules/.prisma/desktop-client');

const prisma = new PrismaClient()

async function main() {
    console.log('Start seeding GIGA MASSIVE drug interactions (~5000+)...')

    const interactions = [];

    // Helper to add group interactions
    const p = (list1, list2, severity, desc) => {
        list1.forEach(d1 => {
            const uniqueList2 = [...new Set(list2)];
            uniqueList2.forEach(d2 => {
                if (d1 !== d2) {
                    interactions.push({
                        drug1: d1,
                        drug2: d2,
                        severity,
                        description: desc.replace('{d1}', d1).replace('{d2}', d2)
                    });
                }
            });
        });
    };

    // Helper for Matrix interactions
    const matrix = (list, severity, desc) => {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                interactions.push({
                    drug1: list[i],
                    drug2: list[j],
                    severity,
                    description: desc.replace('{d1}', list[i]).replace('{d2}', list[j])
                });
            }
        }
    };

    // --- Drug Classes ---

    const warfarins = ['Warfarin'];
    const nsaids = ['Aspirin', 'Ibuprofen', 'Naproxen', 'Diclofenac', 'Meloxicam', 'Celecoxib', 'Indomethacin', 'Ketoprofen', 'Mefenamic Acid', 'Piroxicam', 'Etoricoxib', 'Tenoxicam', 'Lornoxicam', 'Aceclofenac', 'Sulindac', 'Nabumetone'];
    const antiplatelets = ['Clopidogrel', 'Ticagrelor', 'Prasugrel', 'Dipyridamole', 'Cilostazol', 'Ticlopidine'];

    const aceInhibitors = ['Lisinopril', 'Enalapril', 'Captopril', 'Ramipril', 'Perindopril', 'Benazepril', 'Fosinopril', 'Quinapril', 'Trandolapril', 'Moexipril'];
    const arbs = ['Losartan', 'Valsartan', 'Candesartan', 'Telmisartan', 'Irbesartan', 'Olmesartan', 'Eprosartan', 'Azilsartan'];
    const kSparing = ['Spironolactone', 'Eplerenone', 'Amiloride', 'Triamterene', 'Potassium Chloride'];

    const statinsHighRisk = ['Simvastatin', 'Lovastatin'];
    const statinsAll = ['Simvastatin', 'Atorvastatin', 'Rosuvastatin', 'Lovastatin', 'Pravastatin', 'Fluvastatin', 'Pitavastatin'];

    const cyp3a4Inhibitors = ['Clarithromycin', 'Erythromycin', 'Ketoconazole', 'Itraconazole', 'Voriconazole', 'Posaconazole', 'Ritonavir', 'Indinavir', 'Nelfinavir', 'Saquinavir', 'Verapamil', 'Diltiazem', 'Grapefruit', 'Cimetidine', 'Fluconazole'];

    const pde5Inhibitors = ['Sildenafil', 'Tadalafil', 'Vardenafil', 'Avanafil'];
    const nitrates = ['Nitroglycerin', 'Isosorbide Mononitrate', 'Isosorbide Dinitrate'];

    const ssris = ['Fluoxetine', 'Paroxetine', 'Sertraline', 'Citalopram', 'Escitalopram', 'Fluvoxamine'];
    const snris = ['Venlafaxine', 'Duloxetine', 'Desvenlafaxine', 'Milnacipran', 'Levomilnacipran'];
    const tcas = ['Amitriptyline', 'Clomipramine', 'Imipramine', 'Nortriptyline', 'Doxepin', 'Desipramine', 'Trimipramine', 'Protriptyline'];
    const maois = ['Phenelzine', 'Tranylcypromine', 'Selegiline', 'Isocarboxazid', 'Moclobemide', 'Rasagiline', 'Linezolid'];

    const serotonergic = ['Tramadol', 'Dextromethorphan', 'Sumatriptan', 'Zolmitriptan', 'Rizatriptan', 'Eletriptan', 'St. John\'s Wort', 'Fentanyl', 'Methadone', 'Meperidine', 'Tapentadol', 'Ondansetron', 'Granisetron', 'Metoclopramide'];

    const fluoroquinolones = ['Ciprofloxacin', 'Levofloxacin', 'Moxifloxacin', 'Ofloxacin', 'Gemifloxacin', 'Norfloxacin', 'Gatifloxacin'];
    const macrolides = ['Azithromycin', 'Clarithromycin', 'Erythromycin', 'Roxithromycin'];
    const qtProlonging = [
        'Amiodarone', 'Sotalol', 'Haloperidol', 'Ondansetron', 'Domperidone', 'Chloroquine', 'Hydroxychloroquine', 'Quinine', 'Methadone', 'Procainamide', 'Quinidine', 'Disopyramide', 'Dronedarone', 'Ibutilide', 'Dofetilide',
        'Chlorpromazine', 'Thioridazine', 'Ziprasidone', 'Risperidone', 'Quetiapine', 'Olanzapine', 'Clozapine', 'Aripiprazole',
        'Citalopram', 'Escitalopram', 'Fluconazole', 'Ketoconazole', 'Itraconazole', 'Pentamidine'
    ];

    const cations = ['Calcium Carbonate', 'Magnesium Hydroxide', 'Aluminum Hydroxide', 'Ferrous Sulfate', 'Zinc Sulfate', 'Multivitamins with Minerals', 'Sucralfate', 'Bismuth Subsalicylate', 'Calcium Citrate', 'Sevelamer'];
    const tetracyclines = ['Tetracycline', 'Doxycycline', 'Minocycline', 'Oxytetracycline', 'Demeclocycline'];
    const bisphosphonates = ['Alendronate', 'Risedronate', 'Ibandronate', 'Zoledronic Acid'];
    const levothyroxine = ['Levothyroxine'];

    const benzodiazepines = ['Diazepam', 'Alprazolam', 'Lorazepam', 'Clonazepam', 'Bromazepam', 'Chlordiazepoxide', 'Midazolam', 'Temazepam', 'Nitrazepam', 'Oxazepam', 'Triazolam'];
    const opioids = ['Morphine', 'Codeine', 'Tramadol', 'Oxycodone', 'Hydrocodone', 'Fentanyl', 'Methadone', 'Pethidine', 'Buprenorphine', 'Hydromorphone', 'Oxymorphone'];
    const muscleRelaxants = ['Carisoprodol', 'Cyclobenzaprine', 'Metaxalone', 'Methocarbamol', 'Orphenadrine', 'Tizanidine', 'Baclofen', 'Dantrolene'];
    const antipsychotics = ['Olanzapine', 'Risperidone', 'Quetiapine', 'Clozapine', 'Aripiprazole', 'Haloperidol', 'Chlorpromazine', 'Fluphenazine', 'Perphenazine', 'Prochlorperazine'];
    const sedatingAntihistamines = ['Diphenhydramine', 'Chlorpheniramine', 'Promethazine', 'Hydroxyzine', 'Cyproheptadine', 'Meclizine', 'Dimenhydrinate'];
    const anticonvulsants = ['Carbamazepine', 'Phenytoin', 'Phenobarbital', 'Valproic Acid', 'Gabapentin', 'Pregabalin', 'Topiramate', 'Lamotrigine', 'Levetiracetam', 'Clonazepam'];

    const sulfonylureas = ['Glibenclamide', 'Glimepiride', 'Gliclazide', 'Glipizide'];
    const sulfonamides = ['Sulfamethoxazole/Trimethoprim'];
    const betaBlockers = ['Atenolol', 'Metoprolol', 'Bisoprolol', 'Propranolol', 'Carvedilol', 'Nebivolol', 'Labetalol', 'Timolol'];
    const calciumChannelBlockers = ['Amlodipine', 'Nifedipine', 'Felodipine', 'Diltiazem', 'Verapamil', 'Nicardipine'];

    // --- Generating Interactions ---

    // 1. CNS Depressants Matrix
    const cnsDepressants = [...benzodiazepines, ...opioids, ...muscleRelaxants, ...antipsychotics, ...sedatingAntihistamines, 'Zolpidem', 'Eszopiclone', 'Gabapentin', 'Pregabalin', 'Phenobarbital'];
    matrix(cnsDepressants, 'MODERATE', 'زيادة تأثير تثبيط الجهاز العصبي (دوخة، خمول، صعوبة تنفس). يجب توخي الحذر عند الجمع.');

    p(benzodiazepines, opioids, 'HIGH', 'تحذير (Black Box): خطر شديد لتثبيط التنفس، الغيبوبة، والوفاة.');

    // 2. QT Prolongation Matrix
    matrix(qtProlonging, 'MODERATE', 'زيادة خطر استطالة فترة QT واضطراب نظم القلب (Torsades de Pointes).');

    // 3. Serotonin Syndrome Matrix
    const serotonergicsTotal = [...ssris, ...snris, ...tcas, ...maois, ...serotonergic];
    matrix(serotonergicsTotal, 'HIGH', 'خطر متلازمة السيروتونين (Serotonin Syndrome): تشنجات، هذيان، حمى.');

    // 4. Warfarin
    p(warfarins, nsaids, 'HIGH', 'زيادة خطر النزيف المعدي والمعوي. تجنب الجمع إلا بضرورة قصوى.');
    p(warfarins, antiplatelets, 'HIGH', 'خطر نزيف مرتفع جداً. يتطلب مراقبة دقيقة للـ INR.');
    p(warfarins, [...fluoroquinolones, ...macrolides, 'Metronidazole', ...sulfonamides, 'Fluconazole', 'Ketoconazole', 'Cephalexin', 'Amoxicillin/Clavulanate', 'Cefixime', 'Cefpodoxime', 'Azithromycin'], 'HIGH', 'المضاد الحيوي قد يرفع الـ INR ويسبب النزيف.');
    p(warfarins, [...ssris, ...snris], 'MODERATE', 'زيادة خطر النزيف (تأثير على الصفائح).');

    // 5. Hyperkalemia
    const hyperkalemics = [...aceInhibitors, ...arbs, ...kSparing, 'Trimethoprim', 'Pentamidine', 'Cyclosporine', 'Tacrolimus', 'Heparin'];
    matrix(hyperkalemics, 'HIGH', 'خطر ارتفاع البوتاسيوم في الدم (Hyperkalemia) مما قد يؤدي لتوقف القلب.');

    // 6. Nephrotoxicity
    p([...aceInhibitors, ...arbs], nsaids, 'MODERATE', 'يقلل من فعالية دواء الضغط ويزيد العبء على الكلى (Acute Kidney Injury).');

    // 7. Nitrates + PDE5
    p(nitrates, pde5Inhibitors, 'HIGH', 'هبوط حاد وقاتل في ضغط الدم. ممنوع الجمع منعاً باتاً.');

    // 8. CYP3A4
    const cyp3a4Substrates = [...statinsHighRisk, ...benzodiazepines, 'Carbamazepine', 'Colchicine', 'Digoxin', 'Theophylline', 'Warfarin', 'Rivaroxaban', 'Apixaban', 'Amiodarone'];
    p(cyp3a4Inhibitors, cyp3a4Substrates, 'HIGH', 'تثبيط الأيض الدوائي: يرفع تركيز الدواء ويزيد سميته بشكل ملحوظ.');

    // 9. Cations
    p(cations, [...tetracyclines, ...fluoroquinolones, ...bisphosphonates, ...levothyroxine, 'Cefdinir'], 'MODERATE', 'المعادن تمنع امتصاص الدواء. يجب الفصل بساعتين إلى 4 ساعات.');

    // 10. Anticholinergic
    const anticholinergics = [...tcas, ...sedatingAntihistamines, 'Oxybutynin', 'Tolterodine', 'Solifenacin', 'Dicyclomine', 'Hyoscyamine', 'Benztropine', 'Trihexyphenidyl', ...antipsychotics];
    matrix(anticholinergics, 'MODERATE', 'زيادة الآثار الجانبية للكولين (جفاف الفم، احتباس البول، إمساك، تشوش ذهني).');

    // 11. Beta Blockers
    p(['Verapamil', 'Diltiazem'], betaBlockers, 'HIGH', 'خطر بطء القلب الشديد (Bradycardia) وهبوط القلب.');
    p(betaBlockers, [...sulfonylureas, 'Insulin'], 'MODERATE', 'حاصرات بيتا قد تخفي أعراض هبوط السكر.');

    // 12. Digoxin
    p(['Digoxin'], ['Amiodarone', 'Verapamil', 'Diltiazem', 'Clarithromycin', 'Itraconazole', 'Spironolactone', 'Alprazolam', 'Indomethacin'], 'HIGH', 'زيادة مستوى الديجوكسين وخطر التسمم.');

    // 13. Lithium
    p(['Lithium'], [...nsaids, ...aceInhibitors, ...arbs, ...kSparing, 'Furosemide', 'Hydrochlorothiazide', 'Metronidazole', 'Theophylline'], 'HIGH', 'ارتفاع مستوى الليثيوم والتسمم.');

    // 14. Methotrexate
    p(['Methotrexate'], [...nsaids, 'Amoxicillin', 'Penicillin', 'Ampicillin', 'Piperacillin', 'Probenecid', 'Omeprazole', 'Esomeprazole'], 'HIGH', 'زيادة سمية الميثوتريكسيت وتثبيط نخاع العظم.');

    // 15. Theophylline
    p(['Theophylline'], [...fluoroquinolones, 'Cimetidine', 'Fluvoxamine', 'Clarithromycin', 'Erythromycin', 'Zileuton'], 'HIGH', 'زيادة مستوى الثيوفيلين وخطر التشنجات.');

    // 16. Sulfonylureas
    p(sulfonylureas, [...sulfonamides, 'Fluconazole', 'Miconazole', 'Warfarin', ...nsaids, 'Ciprofloxacin', 'Chloramphenicol'], 'MODERATE', 'خطر هبوط السكر (Hypoglycemia).');

    console.log(`Generated ${interactions.length} unique interactions.`);

    let count = 0;
    for (const interaction of interactions) {
        // Check both directions
        const exists = await prisma.drugInteraction.findFirst({
            where: {
                OR: [
                    { drug1: interaction.drug1, drug2: interaction.drug2 },
                    { drug1: interaction.drug2, drug2: interaction.drug1 }
                ]
            }
        })

        if (!exists) {
            await prisma.drugInteraction.create({
                data: interaction
            })
            if (count % 100 === 0) process.stdout.write('.');
            count++;
        }
    }

    console.log(`\n\nDesktop Seeding finished. Added ${count} NEW interactions. Total potential interactions: ${interactions.length}.`);
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
