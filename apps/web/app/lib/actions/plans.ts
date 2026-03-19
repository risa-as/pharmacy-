"use server";

import { auth } from "@/auth";
import { prisma } from "@/app/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireSuperAdmin(): Promise<{ error: string } | null> {
    const session = await auth();
    if ((session?.user as any)?.role !== "SUPER_ADMIN") {
        return { error: "Unauthorized" };
    }
    return null;
}

export async function createPlan(data: {
    name: string;
    price: number;
    maxBranches: number;
    maxUsers: number;
    maxDevices?: number;
    maxMobileUsers?: number;
    features?: any;
    isActive?: boolean;
    isPopular?: boolean;
}) {
    const authError = await requireSuperAdmin();
    if (authError) return { success: false, error: authError.error };

    try {
        await prisma.subscriptionPlan.create({
            data: {
                name: data.name,
                price: Number(data.price),
                maxBranches: Number(data.maxBranches),
                maxUsers: Number(data.maxUsers),
                maxDevices: data.maxDevices !== undefined ? Number(data.maxDevices) : 1,
                maxMobileUsers: data.maxMobileUsers !== undefined ? Number(data.maxMobileUsers) : 1,
                features: data.features,
                isActive: data.isActive ?? true,
                isPopular: data.isPopular ?? false,
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
    maxDevices?: number;
    maxMobileUsers?: number;
    features?: any;
    isActive: boolean;
    isPopular?: boolean;
}) {
    const authError = await requireSuperAdmin();
    if (authError) return { success: false, error: authError.error };

    try {
        await prisma.subscriptionPlan.update({
            where: { id },
            data: {
                name: data.name,
                price: Number(data.price),
                maxBranches: Number(data.maxBranches),
                maxUsers: Number(data.maxUsers),
                maxDevices: data.maxDevices !== undefined ? Number(data.maxDevices) : undefined,
                maxMobileUsers: data.maxMobileUsers !== undefined ? Number(data.maxMobileUsers) : undefined,
                features: data.features,
                isActive: data.isActive,
                isPopular: data.isPopular ?? false,
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
