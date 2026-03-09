export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

// POST: Send WhatsApp message via WhatsApp Cloud API
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { phone, templateName, variables, customMessage } = body;

        if (!phone) return NextResponse.json({ error: "Phone number is required" }, { status: 400 });

        // Format Iraqi phone number
        let formattedPhone = phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) formattedPhone = '964' + formattedPhone.slice(1);
        if (!formattedPhone.startsWith('964')) formattedPhone = '964' + formattedPhone;

        const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
        const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

        if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
            return NextResponse.json({
                error: "WhatsApp not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env"
            }, { status: 503 });
        }

        let payload: any;

        if (templateName) {
            // Use template
            const template = await prisma.whatsAppTemplate.findUnique({
                where: { name: templateName }
            });
            if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

            payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'ar' },
                    components: variables ? [{
                        type: 'body',
                        parameters: variables.map((v: string) => ({ type: 'text', text: v }))
                    }] : []
                }
            };
        } else if (customMessage) {
            // Send plain text
            payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'text',
                text: { body: customMessage }
            };
        } else {
            return NextResponse.json({ error: "templateName or customMessage is required" }, { status: 400 });
        }

        const response = await fetch(
            `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            }
        );

        const result = await response.json();

        if (response.ok) {
            return NextResponse.json({ success: true, messageId: result.messages?.[0]?.id });
        } else {
            return NextResponse.json({ error: result.error?.message || 'WhatsApp API error', details: result }, { status: 400 });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: List WhatsApp templates
export async function GET() {
    try {
        const templates = await prisma.whatsAppTemplate.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json({ templates });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
