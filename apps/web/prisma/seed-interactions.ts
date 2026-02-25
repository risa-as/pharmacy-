import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Start seeding GIGA MASSIVE drug interactions (~5000+)...')

    const interactions: { drug1: string, drug2: string, severity: string, description: string }[] = [];

    // Helper to add group interactions
    const p = (list1: string[], list2: string[], severity: string, desc: string) => {
        list1.forEach(d1 => {
            const uniqueList2 = Array.from(new Set(list2));
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

    // Helper for Matrix interactions (permutations within a large group)
    const matrix = (list: string[], severity: string, desc: string) => {
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
    const maois = ['Phenelzine', 'Tranylcypromine', 'Selegiline', 'Isocarboxazid', 'Moclobemide', 'Rasagiline', 'Linezolid']; // Linezolid is mild MAOI

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

    // 1. CNS Depressants Matrix (Additive CNS Depression)
    // Combine all sedating classes
    const cnsDepressants = [...benzodiazepines, ...opioids, ...muscleRelaxants, ...antipsychotics, ...sedatingAntihistamines, 'Zolpidem', 'Eszopiclone', 'Gabapentin', 'Pregabalin', 'Phenobarbital'];
    // This is a huge group (~50 drugs). Matrix = 50*49/2 = ~1225 interactions.
    matrix(cnsDepressants, 'MODERATE', 'زيادة تأثير تثبيط الجهاز العصبي (دوخة، خمول، صعوبة تنفس). يجب توخي الحذر عند الجمع.');

    // Upgrade specific CNS pairs to HIGH
    p(benzodiazepines, opioids, 'HIGH', 'تحذير (Black Box): خطر شديد لتثبيط التنفس، الغيبوبة، والوفاة.');

    // 2. QT Prolongation Matrix
    // Matrix of QT agents (~30 drugs) = 30*29/2 = ~435 interactions.
    matrix(qtProlonging, 'MODERATE', 'زيادة خطر استطالة فترة QT واضطراب نظم القلب (Torsades de Pointes).');

    // 3. Serotonin Syndrome Matrix
    const serotonergicsTotal = [...ssris, ...snris, ...tcas, ...maois, ...serotonergic];
    // Matrix ~30 drugs = ~435 interactions.
    matrix(serotonergicsTotal, 'HIGH', 'خطر متلازمة السيروتونين (Serotonin Syndrome): تشنجات، هذيان، حمى، عدم استقرار لاإرادي.');

    // 4. Warfarin Interactions
    p(warfarins, nsaids, 'HIGH', 'زيادة خطر النزيف المعدي والمعوي. تجنب الجمع إلا بضرورة قصوى.');
    p(warfarins, antiplatelets, 'HIGH', 'خطر نزيف مرتفع جداً. يتطلب مراقبة دقيقة للـ INR.');
    p(warfarins, [...fluoroquinolones, ...macrolides, 'Metronidazole', ...sulfonamides, 'Fluconazole', 'Ketoconazole', 'Cephalexin', 'Amoxicillin/Clavulanate', 'Cefixime', 'Cefpodoxime', 'Azithromycin'], 'HIGH', 'المضاد الحيوي قد يرفع الـ INR ويسبب النزيف.');
    p(warfarins, [...ssris, ...snris], 'MODERATE', 'زيادة خطر النزيف (تأثير على الصفائح).');

    // 5. Hyperkalemia Group
    const hyperkalemics = [...aceInhibitors, ...arbs, ...kSparing, 'Trimethoprim', 'Pentamidine', 'Cyclosporine', 'Tacrolimus', 'Heparin'];
    matrix(hyperkalemics, 'HIGH', 'خطر ارتفاع البوتاسيوم في الدم (Hyperkalemia) مما قد يؤدي لتوقف القلب.');

    // 6. Nephrotoxicity (Triple Whammy components)
    // ACEI/ARB + NSAID is the base pair
    p([...aceInhibitors, ...arbs], nsaids, 'MODERATE', 'يقلل من فعالية دواء الضغط ويزيد العبء على الكلى (Acute Kidney Injury).');

    // 7. Nitrates + PDE5 (Fatal Hypotension)
    p(nitrates, pde5Inhibitors, 'HIGH', 'هبوط حاد وقاتل في ضغط الدم. ممنوع الجمع منعاً باتاً.');

    // 8. CYP3A4 Inteactions (Inhibitors + Sensitive Substrates)
    const cyp3a4Substrates = [...statinsHighRisk, ...benzodiazepines, 'Carbamazepine', 'Colchicine', 'Digoxin', 'Theophylline', 'Warfarin', 'Rivaroxaban', 'Apixaban', 'Amiodarone'];
    p(cyp3a4Inhibitors, cyp3a4Substrates, 'HIGH', 'تثبيط الأيض الدوائي: يرفع تركيز الدواء ويزيد سميته بشكل ملحوظ.');

    // 9. Cations Absorption Interactions
    p(cations, [...tetracyclines, ...fluoroquinolones, ...bisphosphonates, ...levothyroxine, 'Cefdinir'], 'MODERATE', 'المعادن تمنع امتصاص الدواء. يجب الفصل بساعتين إلى 4 ساعات.');

    // 10. Anticholinergic Burden
    const anticholinergics = [...tcas, ...sedatingAntihistamines, 'Oxybutynin', 'Tolterodine', 'Solifenacin', 'Dicyclomine', 'Hyoscyamine', 'Benztropine', 'Trihexyphenidyl', ...antipsychotics];
    matrix(anticholinergics, 'MODERATE', 'زيادة الآثار الجانبية للكولين (جفاف الفم، احتباس البول، إمساك، تشوش ذهني).');

    // 11. Beta Blockers Combinations
    p(['Verapamil', 'Diltiazem'], betaBlockers, 'HIGH', 'خطر بطء القلب الشديد (Bradycardia) وهبوط القلب.');
    p(betaBlockers, [...sulfonylureas, 'Insulin'], 'MODERATE', 'حاصرات بيتا قد تخفي أعراض هبوط السكر (الرجفة والخفقان).');

    // 12. Digoxin Toxicity Specifics
    p(['Digoxin'], ['Amiodarone', 'Verapamil', 'Diltiazem', 'Clarithromycin', 'Itraconazole', 'Spironolactone', 'Alprazolam', 'Indomethacin'], 'HIGH', 'زيادة مستوى الديجوكسين وخطر التسمم.');

    // 13. Lithium Toxicity Specifics
    p(['Lithium'], [...nsaids, ...aceInhibitors, ...arbs, ...kSparing, 'Furosemide', 'Hydrochlorothiazide', 'Metronidazole', 'Theophylline'], 'HIGH', 'ارتفاع مستوى الليثيوم والتسمم.');

    // 14. Methotrexate Toxicity
    p(['Methotrexate'], [...nsaids, 'Amoxicillin', 'Penicillin', 'Ampicillin', 'Piperacillin', 'Probenecid', 'Omeprazole', 'Esomeprazole'], 'HIGH', 'زيادة سمية الميثوتريكسيت وتثبيط نخاع العظم.');

    // 15. Theophylline Toxicity
    p(['Theophylline'], [...fluoroquinolones, 'Cimetidine', 'Fluvoxamine', 'Clarithromycin', 'Erythromycin', 'Zileuton'], 'HIGH', 'زيادة مستوى الثيوفيلين وخطر التشنجات.');

    // ... (Generation logic remains the same up to line 157)

    // 16. Sulfonylureas Hypoglycemia
    p(sulfonylureas, [...sulfonamides, 'Fluconazole', 'Miconazole', 'Warfarin', ...nsaids, 'Ciprofloxacin', 'Chloramphenicol'], 'MODERATE', 'خطر هبوط السكر (Hypoglycemia).');

    console.log(`Generated ${interactions.length} potential interactions.`);

    // --- Optimized Batch Insertion ---

    // --- Optimized Batch Insertion ---

    // 1. Fetch all existing interactions (Lightweight query)
    console.log("Fetching existing interactions to prevent duplicates...");

    let existingRecords: { drug1: string, drug2: string }[] = [];
    let connected = false;
    let attempts = 0;

    while (!connected && attempts < 3) {
        try {
            existingRecords = await prisma.drugInteraction.findMany({
                select: { drug1: true, drug2: true }
            });
            connected = true;
        } catch (e) {
            attempts++;
            console.error(`Connection attempt ${attempts} failed. Retrying in 2 seconds...`);
            await new Promise(r => setTimeout(r, 2000));
            if (attempts === 3) throw e;
        }
    }

    // 2. Build a Set of existing pairs (normalized order)
    const existingSet = new Set<string>();
    existingRecords.forEach(r => {
        const key = [r.drug1, r.drug2].sort().join('|');
        existingSet.add(key);
    });

    // 3. Filter new interactions
    const toInsert = [];
    const duplicatesInBatch = new Set<string>(); // To prevent duplicates within the new batch itself

    for (const item of interactions) {
        const key = [item.drug1, item.drug2].sort().join('|');

        // Check against DB
        if (existingSet.has(key)) continue;

        // Check against current batch
        if (duplicatesInBatch.has(key)) continue;

        duplicatesInBatch.add(key);
        toInsert.push(item);
    }

    console.log(`Found ${toInsert.length} NEW interactions to insert.`);

    if (toInsert.length > 0) {
        // 4. Batch Insert (Chunked to be safe)
        const BATCH_SIZE = 500;
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
            const chunk = toInsert.slice(i, i + BATCH_SIZE);
            console.log(`Inserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(toInsert.length / BATCH_SIZE)}...`);

            try {
                await prisma.drugInteraction.createMany({
                    data: chunk,
                    skipDuplicates: true
                });
            } catch (error) {
                console.error(`Error inserting batch ${i}:`, error);
                // Wait a bit and retry optionally, or just log
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    console.log(`\n\nSeeding finished. Added ${toInsert.length} interactions.`);
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
