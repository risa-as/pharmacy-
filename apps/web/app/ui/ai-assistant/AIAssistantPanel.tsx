'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Trash2, Send, Loader2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatMessage } from '@/app/lib/ai-assistant';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface UsageInfo {
    limit: number;
    used: number;
    remaining: number;
}

const QUICK_QUESTIONS = [
    'كم مبيعات اليوم؟',
    'ما هي الأدوية الناقصة؟',
    'هل هناك حركات مشبوهة؟',
    'كم ربحنا هذا الشهر؟',
];

const EXAMPLE_CATEGORIES = [
    {
        label: 'المبيعات',
        icon: '📊',
        questions: [
            'كم مبيعات اليوم؟',
            'ما هي مبيعات الأسبوع الماضي؟',
            'كم فاتورة صدرت هذا الأسبوع؟',
            'ما إجمالي المبيعات لشهر نيسان؟',
            'ما مبيعات شهر 3؟',
            'كم مبيعات الشهر الماضي؟',
            'ما الكمية المباعة اليوم؟',
            'ما إجمالي المبيعات في آخر 7 أيام؟',
        ],
    },
    {
        label: 'الأرباح والمالية',
        icon: '💰',
        questions: [
            'ما هي أرباح الشهر الماضي؟',
            'كم ربحنا هذا الشهر؟',
            'ما هي أرباح شهر 4؟',
            'هل الصيدلية رابحة؟',
            'ما هي المصاريف؟',
            'ما صافي الربح؟',
            'ما أرباح هذا العام؟',
            'كم خصم أعطينا اليوم؟',
        ],
    },
    {
        label: 'المخزون',
        icon: '🏥',
        questions: [
            'ما هي الأدوية الناقصة؟',
            'هل هناك أدوية منتهية الصلاحية؟',
            'ما هي الأدوية التي ستنتهي قريباً؟',
            'ما هي الأدوية البطيئة الحركة؟',
            'ما هي الأدوية التي لا تتحرك؟',
            'ما هي الأدوية التي دفن مخزونها؟',
            'هل هناك أدوية ستقترب صلاحيتها؟',
            'كم صنف لدينا في المخزون؟',
        ],
    },
    {
        label: 'المشتريات والموردين',
        icon: '🚚',
        questions: [
            'ما هي الطلبيات المعلقة؟',
            'ما ديون الموردين؟',
            'من هم الموردون؟',
            'ما اشترينا هذا الشهر؟',
            'ما ديون المورد؟',
            'هل هناك طلبيات لم تصل؟',
            'ما فواتير المشتريات؟',
        ],
    },
    {
        label: 'الكاشيرات والموظفون',
        icon: '👥',
        questions: [
            'من فتح الشيفت اليوم؟',
            'ما أداء كل موظف؟',
            'من هم الموظفون؟',
            'كم باع كل كاشير اليوم؟',
            'ما ملخص الشيفت الحالي؟',
        ],
    },
    {
        label: 'الحركات المشبوهة',
        icon: '⚠️',
        questions: [
            'هل هناك حركات مشبوهة؟',
            'هل هناك تلاعب في الأسعار؟',
            'هل هناك تجاوزات في الخصومات؟',
            'هل هناك مرتجعات كثيرة؟',
            'هل هناك اختلاس؟',
        ],
    },
    {
        label: 'معلومات الدواء',
        icon: '💊',
        questions: [
            'كم سعر الباراسيتامول؟',
            'هل لدينا أموكسيسيلين؟',
            'هل يوجد إيبوبروفين؟',
            'كم كمية البندول؟',
            'ما تكلفة الأسبرين؟',
            'كم ثمن ميدازيل؟',
        ],
    },
    {
        label: 'الديون والمرضى',
        icon: '💳',
        questions: [
            'ما ديون المرضى؟',
            'ما ديون العملاء؟',
            'كم دين المريض؟',
        ],
    },
];

const MAX_MESSAGES = 20;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIAssistantPanel() {
    const [isOpen,        setIsOpen]        = useState(false);
    const [messages,      setMessages]      = useState<Message[]>([]);
    const [input,         setInput]         = useState('');
    const [loading,       setLoading]       = useState(false);
    const [provider,      setProvider]      = useState<string | null>(null);
    const [configured,    setConfigured]    = useState(true);
    const [usage,         setUsage]         = useState<UsageInfo | null>(null);
    const [showExamples,  setShowExamples]  = useState(false);
    const bottomRef   = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch provider status once on mount
    useEffect(() => {
        fetch('/api/ai/status')
            .then(r => r.json())
            .then(d => { setProvider(d.provider ?? null); setConfigured(d.configured ?? false); })
            .catch(() => setConfigured(false));
    }, []);

    // Fetch usage whenever the panel opens
    useEffect(() => {
        if (!isOpen) return;
        fetch('/api/ai/usage')
            .then(r => r.json())
            .then(d => { if (d.limit !== undefined) setUsage(d); })
            .catch(() => {});
    }, [isOpen]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // Focus textarea when panel opens
    useEffect(() => {
        if (isOpen) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [isOpen]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        if (messages.length >= MAX_MESSAGES) return;
        if (usage && usage.remaining <= 0) return;

        setShowExamples(false);
        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const history: ChatMessage[] = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content,
            }));

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: trimmed, history }),
            });

            const data = await res.json();
            const content = data.response ?? data.error ?? 'لم أتمكن من الإجابة.';
            setMessages(prev => [...prev, { role: 'assistant', content }]);

            // Refresh usage after a successful call
            if (res.ok) {
                setUsage(prev => prev
                    ? { ...prev, used: prev.used + 1, remaining: Math.max(0, prev.remaining - 1) }
                    : prev
                );
            }
        } catch {
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: 'حدث خطأ في الاتصال. يرجى التحقق من الإنترنت والمحاولة مجدداً.' },
            ]);
        } finally {
            setLoading(false);
        }
    }, [loading, messages, usage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const clearChat = () => {
        toast('مسح المحادثة؟', {
            description: 'سيتم حذف جميع الرسائل بشكل نهائي.',
            action: {
                label: 'مسح',
                onClick: () => setMessages([]),
            },
            cancel: {
                label: 'إلغاء',
                onClick: () => {},
            },
            duration: 6000,
        });
    };

    const providerLabel  = provider === 'openai' ? 'GPT' : provider === 'gemini' ? 'Gemini' : null;
    const atMsgLimit     = messages.length >= MAX_MESSAGES;
    const atDailyLimit   = usage !== null && usage.remaining <= 0;
    const isDisabled     = atMsgLimit || atDailyLimit;

    const usagePct = usage ? Math.round((usage.used / usage.limit) * 100) : 0;
    const usageColor = usagePct >= 90 ? 'text-destructive' : usagePct >= 70 ? 'text-warning' : 'text-violet-200';

    return (
        <>
            {/* Floating trigger button */}
            <button
                onClick={() => setIsOpen(v => !v)}
                title="المساعد الذكي"
                className={`fixed bottom-6 left-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all
                    ${isOpen
                        ? 'bg-violet-700 text-white rotate-12'
                        : 'bg-violet-600 hover:bg-violet-700 text-white'
                    }`}
            >
                <Bot size={24} />
                {configured && !isOpen && (
                    <span className="absolute top-1 right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
                )}
            </button>

            {/* Panel */}
            {isOpen && (
                <div
                    dir="rtl"
                    className="fixed bottom-24 left-2 right-2 sm:left-6 sm:right-auto sm:w-[380px] z-50 flex flex-col h-[80vh] max-h-[750px] rounded-2xl shadow-2xl
                        border border-border bg-background overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-violet-600 text-white">
                        <div className="flex items-center gap-2 min-w-0">
                            <Bot size={20} className="shrink-0" />
                            <span className="font-semibold text-sm">المساعد الذكي</span>
                            {providerLabel && (
                                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full shrink-0">{providerLabel}</span>
                            )}
                            {usage && (
                                <span className={`text-xs px-2 py-0.5 rounded-full bg-black/20 shrink-0 ${usageColor}`}>
                                    {usage.remaining}/{usage.limit}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={() => setShowExamples(v => !v)}
                                title="أمثلة على الأسئلة"
                                className={`p-1.5 rounded-lg transition-colors ${showExamples ? 'bg-white/30' : 'hover:bg-white/20'}`}
                            >
                                <Lightbulb size={15} />
                            </button>
                            {messages.length > 0 && (
                                <button
                                    onClick={clearChat}
                                    title="مسح المحادثة"
                                    className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                                >
                                    <Trash2 size={15} />
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                title="إغلاق"
                                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    {/* Inner wrapper — relative context for the examples overlay */}
                    <div className="relative flex flex-col flex-1 min-h-0">

                    {/* Examples overlay */}
                    {showExamples && (
                        <div className="absolute inset-0 z-10 flex flex-col bg-background border-t border-border overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/50">
                                <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                    <Lightbulb size={14} className="text-violet-500" />
                                    أمثلة على الأسئلة
                                </div>
                                <button
                                    onClick={() => setShowExamples(false)}
                                    className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                                {EXAMPLE_CATEGORIES.map(cat => (
                                    <div key={cat.label}>
                                        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                                            <span>{cat.icon}</span>
                                            <span>{cat.label}</span>
                                        </p>
                                        <div className="flex flex-col gap-1">
                                            {cat.questions.map(q => (
                                                <button
                                                    key={q}
                                                    onClick={() => sendMessage(q)}
                                                    disabled={isDisabled || !configured}
                                                    className="text-right text-xs px-3 py-1.5 rounded-lg border border-border
                                                        hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700
                                                        dark:hover:bg-violet-900/30 dark:hover:border-violet-700 dark:hover:text-violet-300
                                                        transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                        {/* Welcome state */}
                        {messages.length === 0 && (
                            <div className="text-center space-y-3 pt-4">
                                <p className="text-sm text-muted-foreground">
                                    {!configured
                                        ? '⚠️ المساعد الذكي غير مفعّل — يرجى ضبط AI_PROVIDER في ملف .env'
                                        : atDailyLimit
                                        ? '⛔ تجاوزت الحد اليومي للمساعد الذكي. يتجدد الحد منتصف الليل بتوقيت بغداد.'
                                        : 'اسألني أي شيء عن مبيعاتك أو مخزونك أو أرباحك'}
                                </p>
                                {configured && !atDailyLimit && (
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {QUICK_QUESTIONS.map(q => (
                                            <button
                                                key={q}
                                                onClick={() => sendMessage(q)}
                                                className="text-xs px-3 py-1.5 rounded-full border border-violet-300
                                                    text-violet-700 hover:bg-violet-50 dark:text-violet-400
                                                    dark:border-violet-700 dark:hover:bg-violet-900/30 transition-colors"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Chat bubbles */}
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed
                                        ${msg.role === 'user'
                                            ? 'bg-violet-600 text-white rounded-br-sm'
                                            : 'bg-muted text-foreground rounded-bl-sm'
                                        }`}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {loading && (
                            <div className="flex justify-end">
                                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                                    {[0, 1, 2].map(i => (
                                        <span
                                            key={i}
                                            className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
                                            style={{ animationDelay: `${i * 150}ms` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Limit warnings */}
                        {atMsgLimit && (
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground mb-2">وصلت للحد الأقصى للمحادثة (20 رسالة)</p>
                                <button
                                    onClick={() => setMessages([])}
                                    className="text-xs text-violet-600 hover:underline"
                                >
                                    بدء محادثة جديدة
                                </button>
                            </div>
                        )}
                        {atDailyLimit && !atMsgLimit && (
                            <div className="text-center">
                                <p className="text-xs text-destructive">⛔ استنفدت الحد اليومي ({usage?.limit} رسالة). يتجدد منتصف الليل بتوقيت بغداد.</p>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-border p-3">
                        <div className="flex gap-2 items-end">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={
                                    atMsgLimit ? 'امسح المحادثة للمتابعة...'
                                    : atDailyLimit ? 'الحد اليومي مستنفَد...'
                                    : 'اكتب سؤالك...'
                                }
                                disabled={loading || isDisabled || !configured}
                                rows={1}
                                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2
                                    text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2
                                    focus:ring-violet-500 disabled:opacity-50 max-h-28 overflow-y-auto"
                                style={{ direction: 'rtl' }}
                            />
                            <button
                                onClick={() => sendMessage(input)}
                                disabled={!input.trim() || loading || isDisabled || !configured}
                                className="flex-shrink-0 p-2.5 rounded-xl bg-violet-600 text-white
                                    hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
                            Enter للإرسال • Shift+Enter لسطر جديد
                        </p>
                    </div>
                    </div>{/* end inner relative wrapper */}
                </div>
            )}
        </>
    );
}
