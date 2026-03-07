export const dynamic = 'force-dynamic';


import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { message: 'البريد الإلكتروني وكلمة المرور مطلوبان' },
                { status: 400 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            return NextResponse.json(
                { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
                { status: 401 }
            );
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            // Check for hardcoded fallback if specific env (optional, copying auth.ts logic if needed)
            if (password !== user.password) {
                return NextResponse.json(
                    { message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' },
                    { status: 401 }
                );
            }
        }

        // Generate a simple token (mock for now, or use a library if verified)
        // Since we don't have JWT secret setup visible, we'll return a basic token
        const token = Buffer.from(`${user.email}:${Date.now()}`).toString('base64');

        // Return user data matching the interface expected by mobile app
        return NextResponse.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                branchId: user.branchId || null,
            }
        });

    } catch (error) {
        console.error('Login API Error:', error);
        return NextResponse.json(
            { message: 'حدث خطأ في الخادم' },
            { status: 500 }
        );
    }
}
