import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// GET: List all tenants (super admin only)
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'SUPER_ADMIN')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const organizations = await prisma.organization.findMany({
            include: {
                plan: true,
                branches: {
                    include: { users: { where: { role: 'ADMIN' } } }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const tenants = organizations.map(org => {
            // Find the main owner/admin from the first branch
            const owner = org.branches[0]?.users[0];
            return {
                id: org.id,
                name: org.name,
                slug: org.id, // Or another generated slug
                ownerEmail: owner?.email || 'N/A',
                planId: org.plan?.id,
                plan: org.plan,
                maxBranches: org.maxBranches || org.plan?.maxBranches || 1,
                maxUsers: org.maxUsers || org.plan?.maxUsers || 3,
                monthlyPrice: org.plan?.price || 0,
                isActive: !org.isSuspended,
                trialEndsAt: null
            };
        });

        return NextResponse.json({ tenants });
    } catch (e: any) {
        console.error("==> Error in /api/admin/tenants:", e.message);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Create a new tenant (onboarding)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, ownerEmail, phone, plan, maxBranches, maxUsers } = body;

        if (!name || !ownerEmail) {
            return NextResponse.json({ error: "name and ownerEmail are required" }, { status: 400 });
        }

        // Generate slug from name
        const slug = name.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();

        // Check uniqueness
        const existing = await prisma.tenant.findUnique({ where: { slug } });
        if (existing) return NextResponse.json({ error: "اسم المؤسسة محجوز" }, { status: 400 });

        // Fetch plan dynamically, fallback to first ACTIVE FREE plan
        let selectedPlan = null;
        if (plan) {
            selectedPlan = await prisma.subscriptionPlan.findUnique({ where: { id: plan } });
        }

        if (!selectedPlan) {
            selectedPlan = await prisma.subscriptionPlan.findFirst({
                where: { name: 'FREE', isActive: true }
            });
        }

        if (!selectedPlan) {
            return NextResponse.json({ error: "لا توجد باقة صالحة تم العثور عليها" }, { status: 400 });
        }

        const tenant = await prisma.tenant.create({
            data: {
                name,
                slug,
                ownerEmail,
                phone: phone || null,
                planId: selectedPlan.id,
                maxBranches: maxBranches || selectedPlan.maxBranches,
                maxUsers: maxUsers || selectedPlan.maxUsers,
                monthlyPrice: selectedPlan.price,
                trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
                features: JSON.stringify(['pos', 'inventory', 'reports'])
            }
        });

        return NextResponse.json({ tenant }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
