'use server';

import { prisma } from "../prisma";

export type InteractionResult = {
    found: boolean;
    interactions: {
        drug1: string;
        drug2: string;
        severity: string;
        description: string;
    }[];
};

export async function checkDrugInteraction(
    newDrugScientificName: string,
    currentCartScientificNames: string[]
): Promise<InteractionResult> {
    if (!newDrugScientificName || currentCartScientificNames.length === 0) {
        return { found: false, interactions: [] };
    }

    // Normalize input
    const target = newDrugScientificName.trim();
    const existing = currentCartScientificNames.map(d => d.trim()).filter(d => d !== target && d.length > 0);

    if (existing.length === 0) {
        return { found: false, interactions: [] };
    }

    try {
        // Find interactions where either drug is the new drug AND the other drug is in the cart
        const interactions = await prisma.drugInteraction.findMany({
            where: {
                OR: [
                    {
                        drug1: target,
                        drug2: { in: existing }
                    },
                    {
                        drug2: target,
                        drug1: { in: existing }
                    }
                ]
            }
        });

        if (interactions.length > 0) {
            return {
                found: true,
                interactions: interactions.map(i => ({
                    drug1: i.drug1,
                    drug2: i.drug2,
                    severity: i.severity,
                    description: i.description
                }))
            };
        }

        return { found: false, interactions: [] };

    } catch (error) {
        console.error("Error checking drug interactions:", error);
        return { found: false, interactions: [] };
    }
}
