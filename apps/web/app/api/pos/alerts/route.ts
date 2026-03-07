import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantContext } from "@/app/lib/tenant-utils";

export async function POST(req: NextRequest) {
    try {
        const tenantCtx = await getTenantContext();
        if (tenantCtx instanceof NextResponse) return tenantCtx;

        const body = await req.json();
        const { scientificNames, patientId } = body;

        // Validation
        if (!scientificNames || !Array.isArray(scientificNames) || scientificNames.length === 0) {
            return NextResponse.json({ interactions: [], allergyWarnings: [] }, { status: 200 });
        }

        const validScientificNames = scientificNames.map(n => n.trim()).filter(Boolean);
        if (validScientificNames.length === 0) {
            return NextResponse.json({ interactions: [], allergyWarnings: [] }, { status: 200 });
        }

        let interactions: any[] = [];
        let allergyWarnings: string[] = [];

        // 1. Check Drug Interactions
        if (validScientificNames.length >= 2) {
            interactions = await prisma.drugInteraction.findMany({
                where: {
                    AND: [
                        { drug1: { in: validScientificNames } },
                        { drug2: { in: validScientificNames } }
                    ]
                }
            });
        }

        // 2. Check Patient Allergies
        if (patientId) {
            const patient = await prisma.patient.findUnique({
                where: { id: patientId },
                select: { allergies: true }
            });

            if (patient && patient.allergies && Array.isArray(patient.allergies)) {
                const patientAllergyList = patient.allergies.map((a: string) => a.toLowerCase().trim()).filter(Boolean);

                if (patientAllergyList.length > 0) {
                    allergyWarnings = validScientificNames.filter(name =>
                        patientAllergyList.some((allergy: string) => name.toLowerCase().includes(allergy) || allergy.includes(name.toLowerCase()))
                    );
                }
            }
        }

        return NextResponse.json({ interactions, allergyWarnings }, { status: 200 });

    } catch (error: any) {
        console.error("Pharmacovigilance API Error:", error);
        return NextResponse.json(
            { error: "Failed to process pharmacovigilance checks" },
            { status: 500 }
        );
    }
}
