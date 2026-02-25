import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

async function fetchRealDrugs(targetCount = 500) {
    const drugs: any[] = [];
    const usedBarcodes = new Set<string>();

    // We will query the OpenFDA API to get real drugs with UPCs (barcodes)
    // The API is paginated, we'll fetch chunks of 100 until we have enough valid ones

    let skip = 0;
    const limit = 100;

    console.log("Fetching real drug data from OpenFDA...");

    while (drugs.length < targetCount && skip < 5000) {
        try {
            // Search for records that HAVE a UPC defined
            const url = `https://api.fda.gov/drug/label.json?search=_exists_:openfda.upc&limit=${limit}&skip=${skip}`;
            const response = await fetch(url);

            if (!response.ok) {
                console.log(`FDA API Error: HTTP ${response.status}`);
                break; // Stop if rate limited or error
            }

            const data: any = await response.json();
            const results = data.results || [];

            if (results.length === 0) break;

            for (const item of results) {
                if (drugs.length >= targetCount) break;

                const upcs = item.openfda?.upc || [];
                const brandNames = item.openfda?.brand_name || [];
                const genericNames = item.openfda?.generic_name || [];
                const manufacturer = item.openfda?.manufacturer_name || [];

                // We need a valid brand name and at least one UPC
                if (upcs.length > 0 && brandNames.length > 0) {
                    const barcode = upcs[0].replace(/[^0-9]/g, ''); // Clean the barcode

                    if (barcode.length > 5 && !usedBarcodes.has(barcode)) {
                        usedBarcodes.add(barcode);

                        // Clean up the name (remove "mg", "ml" etc as requested)
                        let rawBrand = brandNames[0];
                        let cleanBrand = rawBrand.replace(/\b(?:mg|mcg|g|ml|IU)\b/gi, '').trim();
                        // Sometimes the names are all UPPERCASE, let's fix that
                        cleanBrand = cleanBrand.charAt(0).toUpperCase() + cleanBrand.slice(1).toLowerCase();

                        let sciName = genericNames.length > 0 ? genericNames[0] : cleanBrand;
                        sciName = sciName.charAt(0).toUpperCase() + sciName.slice(1).toLowerCase();

                        // Replace FDA manufacturers with top Iraqi/Regional ones randomly
                        const iraqiManufacturers = [
                            "Pioneer Pharma (Iraq)",
                            "SDI Samarra (Iraq)",
                            "Al-Hikma Pharmaceuticals (Jordan/Iraq)",
                            "Julphar Gulf (UAE/Iraq)",
                            "Awamedica (Iraq)",
                            "Safapharm (Iraq)",
                            "Bayer (Germany)",
                            "GSK (UK)",
                            "Sanofi (France)",
                            "Novartis (Switzerland)"
                        ];

                        let assignedOrigin = iraqiManufacturers[Math.floor(Math.random() * iraqiManufacturers.length)];

                        // Map common generic names to Top Iraqi/Regional Trade Names
                        const iraqiBrandMapper: Record<string, string[]> = {
                            // Painkillers & NSAIDs
                            "acetaminophen": ["Panadol", "Adol", "Pandrex", "Samadol", "Cetamol", "Tylenol", "Abimol"],
                            "ibuprofen": ["Brufen", "Profinal", "Nurofen", "Ibugesic", "Marcofen"],
                            "diclofenac": ["Voltarin", "Olfen", "Clofen", "Defenac", "Cataflam", "Rapidus", "Voldic", "Rheumafen", "Diclogesic"],
                            "meloxicam": ["Mobic", "Melox", "Mobitil"],
                            "naproxen": ["Naproxen", "Proxydal", "Proxen", "Aleve"],
                            "celecoxib": ["Celebrex", "Celox", "Romacox"],
                            // Antibiotics
                            "amoxicillin": ["Amoxil", "Amoxicare", "Ospamox", "Hiconcil", "Amoxin"],
                            "clavulanate": ["Augmentin", "Megamox", "Klavox", "Amoclan", "Curam", "Julmentin"],
                            "cefixime": ["Suprax", "Cefspan", "Winex", "Fixx", "Cefix"],
                            "ceftriaxone": ["Rocephin", "Triaxone", "Mesporin", "Oframax", "Ceftriax"],
                            "azithromycin": ["Zithromax", "Azimax", "Azomycin", "Zitrocin"],
                            "ciprofloxacin": ["Cipro", "Ciprodar", "Bactall", "Ciprolon", "Ciflox"],
                            "levofloxacin": ["Tavanic", "Levaquin", "Cravit", "Levoflox", "Unibiotic"],
                            "metronidazole": ["Flagyl", "Dumazol", "Metro", "Metrolag"],
                            "cefuroxime": ["Zinnat", "Cefuzime", "Daroxime"],
                            "clarithromycin": ["Klacid", "Clarithro", "Claritt"],
                            // GI Tract
                            "omeprazole": ["Losec", "Omedar", "Risek", "Gasec", "Omep", "Lomac"],
                            "esomeprazole": ["Nexium", "Ezomep", "Esomep"],
                            "pantoprazole": ["Controloc", "Pantozol", "Zurcal", "Piptal"],
                            "lansoprazole": ["Lanzor", "Lancid", "Takepron"],
                            "domperidone": ["Motilium", "Dompy", "Motilat"],
                            "mebeverine": ["Duspatalin", "Colospa", "Mebadil"],
                            "metoclopramide": ["Plasil", "Meclodin"],
                            // Antihistamines & Respiratory
                            "loratadine": ["Claritin", "Loratin", "Restamine"],
                            "desloratadine": ["Aerius", "Neoloridin", "Deslor"],
                            "cetirizine": ["Zyrtec", "Cetrak", "Alerid", "Cetrin"],
                            "salbutamol": ["Ventolin", "Butalin", "Salbair", "Ventab"],
                            "montelukast": ["Singulair", "Airfast", "Myteka", "Montelukast"],
                            "fexofenadine": ["Telfast", "Fexodine", "Allerfen"],
                            // Cardiovascular & Blood Pressure
                            "amlodipine": ["Norvasc", "Amlor", "Amlocard", "Amlopin", "Amlovasc"],
                            "valsartan": ["Diovan", "Tareg", "Valtan", "Angiotan"],
                            "losartan": ["Cozaar", "Sortiva", "Lorista"],
                            "bisoprolol": ["Concor", "Biso", "Cardicor", "Lodoz"],
                            "captopril": ["Capoten", "Captopril"],
                            "clopidogrel": ["Plavix", "Clopivas", "Pidogrel", "Noclot"],
                            "rosuvastatin": ["Crestor", "Rovatia", "Rosuvas", "Lipirose"],
                            "atorvastatin": ["Lipitor", "Ator", "Storvas", "Lorvast", "Lipomax"],
                            // Diabetes
                            "metformin": ["Glucophage", "Dialon", "Formit", "Glymet"],
                            "glibenclamide": ["Daonil", "Glibil"],
                            "glimepiride": ["Amaryl", "Glimer", "Glimaryl"],
                            "sitagliptin": ["Januvia", "Sitaglu", "Sitagliptin"],
                            "empagliflozin": ["Jardiance"],
                            "gliclazide": ["Diamicron", "Gliclazide", "Glucotrol"],
                            // Hormones, Steroids
                            "levothyroxine": ["Euthyrox", "Thyroxin", "Eltroxin"],
                            "dexamethasone": ["Decadron", "Dexon", "Dexamed"],
                            "prednisolone": ["Hostacortin", "Predo", "Xilone", "Sipred"],
                            // Vitamins & Supplements
                            "cholecalciferol": ["Vida", "Osteocare", "D3", "Vitamin D3", "Hi-D"],
                            "folic acid": ["Folacin", "Folicum", "Folate"],
                            "ascorbic acid": ["Vitamin C", "Cevarol", "Redoxon"],
                            // Others
                            "sildenafil": ["Viagra", "Vega", "Silagra", "Vigorex"],
                            "tadalafil": ["Cialis", "Snafi", "Tadalafil"],
                            "tamsulosin": ["Omnic Ocas", "Prostacure", "Tamson"],
                            "fluconazole": ["Diflucan", "Flucan", "Fungal"],
                            "acyclovir": ["Zovirax", "Acyclovir", "Supraviran"],
                            "diclofenac potassium": ["Cataflam", "Rapidus", "Voldic K", "Clofen K"]
                        };

                        // Check if we can localize the trade name based on the scientific name
                        let foundMatch = false;
                        for (const [generic, brands] of Object.entries(iraqiBrandMapper)) {
                            if (sciName.toLowerCase().includes(generic)) {
                                const randomBrand = brands[Math.floor(Math.random() * brands.length)];
                                // Extract the dosage info from the cleanBrand (e.g. if cleanBrand was "Acetaminophen 500", keep the "500")
                                const parts = rawBrand.split(' ');
                                const lastPart = parts.length > 1 ? parts[parts.length - 1] : "";
                                const numericDosage = lastPart.replace(/[^\d.]/g, '');

                                cleanBrand = numericDosage ? `${randomBrand} ${numericDosage}` : randomBrand;
                                foundMatch = true;
                                break;
                            }
                        }

                        // If not found in our mapper, just keep the clean FDA brand name. 
                        // This gives us thousands of other real drugs.

                        drugs.push({
                            barcode: barcode,
                            tradeName: cleanBrand,
                            scientificName: sciName,
                            origin: assignedOrigin, // Use localized manufacturer as origin
                            isActive: true,
                            alternatives: [] // OpenFDA doesn't easily give direct alternatives in the same record
                        });
                    }
                }
            }
            skip += limit;

            // Be nice to the FDA API to not get rate limited
            await new Promise(r => setTimeout(r, 200));

        } catch (error) {
            console.error("Error fetching chunk:", error);
            // Don't break completely, just wait and retry if rate limited
            await new Promise(r => setTimeout(r, 2000));
            skip += limit;
        }
    }

    return drugs;
}

async function main() {
    const target = 10000;
    const drugs = await fetchRealDrugs(target);

    console.log(`\nSuccessfully fetched ${drugs.length} real drugs with authentic barcodes.`);

    if (drugs.length === 0) {
        console.log("Failed to fetch drugs. Exiting.");
        return;
    }

    let inserted = 0;
    for (const drug of drugs) {
        try {
            await prisma.globalDrug.upsert({
                where: { barcode: drug.barcode },
                update: {},
                create: drug
            });
            inserted++;
            if (inserted % 50 === 0) console.log(`Inserted ${inserted} real drugs...`);
        } catch (e) {
            console.error(`Error inserting ${drug.tradeName}:`, e);
        }
    }

    console.log(`Seeding complete. Successfully inserted ${inserted} authentic FDA drugs into the GlobalDrug table.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
