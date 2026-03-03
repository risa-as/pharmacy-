"use server";

import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createPlan(data: {
    name: string;
    price: number;
    maxBranches: number;
    maxUsers: number;
    features?: any;
    isActive?: boolean;
}) {
    try {
        await prisma.subscriptionPlan.create({
            data: {
                name: data.name,
                price: Number(data.price),
                maxBranches: Number(data.maxBranches),
                maxUsers: Number(data.maxUsers),
                features: data.features,
                isActive: data.isActive ?? true,
            }
        });
        revalidatePath("/dashboard/admin/plans");
        return { success: true };
    } catch (error: any) {
        console.error("Failed to create plan:", error);
        return { success: false, error: error.message };
    }
}

export async function updatePlan(id: string, data: {
    name: string;
    price: number;
    maxBranches: number;
    maxUsers: number;
    features?: any;
    isActive: boolean;
}) {
    try {
        await prisma.subscriptionPlan.update({
            where: { id },
            data: {
                name: data.name,
                price: Number(data.price),
                maxBranches: Number(data.maxBranches),
                maxUsers: Number(data.maxUsers),
                features: data.features,
                isActive: data.isActive,
            }
        });
        revalidatePath("/dashboard/admin/plans");
        return { success: true };
    } catch (error: any) {
        console.error("Failed to update plan:", error);
        return { success: false, error: error.message };
    }
}

export async function getPlans() {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            orderBy: { price: 'asc' }
        });
        return { success: true, data: plans };
    } catch (error: any) {
        console.error("Failed to fetch plans:", error);
        return { success: false, error: error.message };
    }
}
