'use client';

import { useState, useEffect } from 'react';
import { Send, MessageSquare, Phone } from 'lucide-react';

export default function WhatsAppPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [variables, setVariables] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState('');

    useEffect(() => {
        fetch('/api/notifications/whatsapp').then(r => r.json()).then(d => setTemplates(d.templates || []));
    }, []);

    const sendMessage = async () => {
        if (!phone) return;
        setSending(true);
        setResult('');
        try {
            const payload: any = { phone };
            if (selectedTemplate) {
                payload.templateName = selectedTemplate;
                if (variables.length > 0) payload.variables = variables;
            } else if (message) {
                payload.customMessage = message;
            } else return;

            const res = await fetch('/api/notifications/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                setResult(`✅ تم الإرسال بنجاح (ID: ${data.messageId})`);
                setPhone(''); setMessage('');
            } else {
                setResult(`❌ ${data.error || 'فشل الإرسال'}`);
            }
        } catch (e) { setResult('❌ خطأ في الاتصال'); }
        finally { setSending(false); }
    };

    return (
        <div className="glass-card p-6 space-y-6" dir="rtl">
            <h1 className="text-2xl font-bold text-foreground">📱 إشعارات WhatsApp</h1>

            <div className="bg-card rounded-xl shadow-sm border p-6 max-w-xl space-y-4">
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                        <Phone className="w-3 h-3 inline ml-1" /> رقم الهاتف (عراقي)
                    </label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                        placeholder="07xxxxxxxxx"
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" dir="ltr" />
                </div>

                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">نوع الرسالة</label>
                    <div className="flex gap-3 text-sm">
                        <label className="flex items-center gap-1">
                            <input type="radio" name="msgType" checked={!selectedTemplate}
                                onChange={() => setSelectedTemplate('')} /> رسالة مخصصة
                        </label>
                        <label className="flex items-center gap-1">
                            <input type="radio" name="msgType" checked={!!selectedTemplate}
                                onChange={() => setSelectedTemplate(templates[0]?.name || '')} /> قالب
                        </label>
                    </div>
                </div>

                {!selectedTemplate ? (
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">
                            <MessageSquare className="w-3 h-3 inline ml-1" /> الرسالة
                        </label>
                        <textarea value={message} onChange={e => setMessage(e.target.value)}
                            rows={3} placeholder="اكتب رسالتك هنا..."
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-muted" />
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">اختر قالب</label>
                        <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm bg-muted">
                            {templates.map((t: any) => <option key={t.id} value={t.name}>{t.name} ({t.type})</option>)}
                        </select>
                    </div>
                )}

                <button onClick={sendMessage} disabled={sending || !phone}
                    className="flex items-center gap-2 px-6 py-2.5 bg-success text-success-foreground rounded-lg text-sm font-bold hover:bg-success/90 disabled:opacity-50">
                    <Send className="w-4 h-4" /> {sending ? 'جاري الإرسال...' : 'إرسال عبر WhatsApp'}
                </button>

                {result && <div className="p-3 rounded-lg bg-muted text-sm text-center">{result}</div>}
            </div>

            {/* Setup Guide */}
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-5 max-w-xl">
                <h3 className="font-bold text-warning mb-2">⚙️ إعداد WhatsApp Cloud API</h3>
                <ol className="text-sm text-warning space-y-1 list-decimal mr-5">
                    <li>أنشئ حساب في <span className="font-medium">Meta for Developers</span></li>
                    <li>فعّل WhatsApp Business API</li>
                    <li>أضف المتغيرات في ملف <code className="bg-warning/20 px-1 rounded">.env</code>:</li>
                </ol>
                <pre className="mt-2 text-xs bg-warning/20 rounded p-2 text-warning" dir="ltr">
                    {`WHATSAPP_TOKEN=your_token_here
WHATSAPP_PHONE_ID=your_phone_id`}
                </pre>
            </div>
        </div>
    );
}
