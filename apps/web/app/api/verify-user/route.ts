
import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        const user = await prisma.user.findFirst({
            where: { email }
        });

        if (!user) {
            return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }

        const isMatch = bcrypt.compareSync(password, user.password);

        if (!isMatch) {
            return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
        }

        // Return user data including branchId
        const { password: _, ...userWithoutPassword } = user;
        return NextResponse.json({
            success: true,
            user: userWithoutPassword
        });

    } catch (error) {
        console.error("Verify user error:", error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
