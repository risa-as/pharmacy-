import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

// GET: List all tenants (super admin only)
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user || session.user.role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const tenants = await prisma.tenant.findMany({
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({ tenants });
    } catch (e: any) {
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

        // Set limits based on plan
        const planLimits: Record<string, { branches: number; users: number; price: number }> = {
            FREE: { branches: 1, users: 3, price: 0 },
            BASIC: { branches: 2, users: 10, price: 25 },
            PROFESSIONAL: { branches: 5, users: 25, price: 75 },
            ENTERPRISE: { branches: 99, users: 999, price: 200 },
        };

        const selectedPlan = planLimits[plan || 'FREE'] || planLimits.FREE;

        const tenant = await prisma.tenant.create({
            data: {
                name,
                slug,
                ownerEmail,
                phone: phone || null,
                plan: plan || 'FREE',
                maxBranches: maxBranches || selectedPlan.branches,
                maxUsers: maxUsers || selectedPlan.users,
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
