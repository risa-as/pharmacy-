export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';
import { enforceRateLimit } from '@/app/lib/rate-limit';
import { signPatientToken } from '@/app/lib/patient-app-auth';

// POST: Patient Registration / Login
export async function POST(req: NextRequest) {
    try {
        const limited = await enforceRateLimit(req, 'patient-app-auth', 10, 60_000);
        if (limited) return limited;

        const body = await req.json();
        const { action, phone, password, name, email } = body;

        if (!phone || !password) {
            return NextResponse.json({ error: "Phone and password are required" }, { status: 400 });
        }

        // Format Iraqi phone
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '964' + formattedPhone.slice(1);

        if (action === 'register') {
            // Check if exists
            const existing = await prisma.patientAppUser.findUnique({ where: { phone: formattedPhone } });
            if (existing) return NextResponse.json({ error: "رقم الهاتف مسجل مسبقاً" }, { status: 400 });

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await prisma.patientAppUser.create({
                data: {
                    phone: formattedPhone,
                    password: hashedPassword,
                    name: name || null,
                    email: email || null
                }
            });

            const token = await signPatientToken(user.id);
            return NextResponse.json({
                success: true,
                token,
                user: { id: user.id, phone: user.phone, name: user.name }
            }, { status: 201 });

        } else {
            // Login
            const user = await prisma.patientAppUser.findUnique({ where: { phone: formattedPhone } });
            if (!user) return NextResponse.json({ error: "رقم الهاتف غير مسجل" }, { status: 404 });

            const valid = await bcrypt.compare(password, user.password);
            if (!valid) return NextResponse.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 });

            const token = await signPatientToken(user.id);
            return NextResponse.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    phone: user.phone,
                    name: user.name,
                    email: user.email,
                    isVerified: user.isVerified
                }
            });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
