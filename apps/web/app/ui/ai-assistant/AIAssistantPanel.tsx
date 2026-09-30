'use client';

import { EXAMPLE_CATEGORIES, QUICK_QUESTIONS } from '@/app/lib/assistant-examples';
import { monthlyStockoutRequest } from '@/app/lib/month-reorder';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Trash2, Send, Loader2, Lightbulb, Sparkles, ShoppingCart, ChevronLeft, ArrowRight, Maximize2, Minimize2, Plus, Package, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';
import type { ChatMessage } from '@/app/lib/ai-assistant';
import type { AssistantCard } from '@/app/lib/ai-cards';
import { AssistantCardView } from './AssistantCards';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
    role: 'user' | 'assistant';
    content: string;
    /** Deterministic cards from the system data (never sent back as history). */
    cards?: AssistantCard[];
}

interface UsageInfo {
    limit: number;
    used: number;
    remaining: number;
}

const MAX_MESSAGES = 40;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIAssistantPanel() {
    const [isOpen,        setIsOpen]        = useState(false);
    const [messages,      setMessages]      = useState<Message[]>([]);
    const [input,         setInput]         = useState('');
    const [purchaseDays, setPurchaseDays] = useState('');
    const [showPurchase, setShowPurchase] = useState(false);
    const [showTools, setShowTools] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const validPurchaseDays = /^\d+$/.test(purchaseDays) && Number(purchaseDays) >= 1 && Number(purchaseDays) <= 365;
    const [loading,       setLoading]       = useState(false);
    const [configured,    setConfigured]    = useState(true);
    const [usage,         setUsage]         = useState<UsageInfo | null>(null);
    const [showExamples,  setShowExamples]  = useState(false);
    const [activeTab,     setActiveTab]     = useState(0);
    const bottomRef   = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // The conversation survives navigation within this tab only (sessionStorage,
    // per user): it contains financial data and pharmacy computers are shared.
    const { data: session } = useSession();
    const userId = (session?.user as any)?.id as string | undefined;
    const storeKey = userId ? `ai-chat:v1:${userId}` : null;
    const restored = useRef<string | null>(null);
    useEffect(() => {
        if (!storeKey || restored.current === storeKey) return;
        restored.current = storeKey;
        try {
            const saved = JSON.parse(sessionStorage.getItem(storeKey) || '[]');
            setMessages(Array.isArray(saved) ? saved.slice(-MAX_MESSAGES) : []);
        } catch { setMessages([]); }
    }, [storeKey]);
    useEffect(() => {
        if (!storeKey || restored.current !== storeKey) return;
        try { sessionStorage.setItem(storeKey, JSON.stringify(messages)); } catch { /* storage unavailable: memory only */ }
    }, [messages, storeKey]);

    // Fetch provider status once on mount
    useEffect(() => {
        fetch('/api/ai/status')
            .then(r => r.json())
            .then(d => { setConfigured(d.configured ?? false); })
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
    }, [messages, loading, showPurchase]);

    // Focus textarea when panel opens
    useEffect(() => {
        if (isOpen) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [isOpen]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || loading) return;

        if (messages.length >= MAX_MESSAGES) return;
        if (usage && usage.remaining <= 0 && !monthlyStockoutRequest(trimmed)) return;

        setShowExamples(false);
        setShowTools(false);
        const userMsg: Message = { role: 'user', content: trimmed };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setShowPurchase(false);
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
            const cards: AssistantCard[] = Array.isArray(data.cards) ? data.cards : [];
            const content = data.response ?? data.notice ?? data.error ?? (cards.length ? '' : 'لم أتمكن من الإجابة.');
            setMessages(prev => [...prev, { role: 'assistant', content, cards }]);

            // Only a model answer uses the daily quota (cards alone do not).
            if (res.ok && data.response) {
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

    const runInsight = useCallback(async (kind: 'reorder' | 'waste' | 'daily', label: string) => {
        if (loading || messages.length >= MAX_MESSAGES) return;
        setShowPurchase(false);
        setShowExamples(false);
        setShowTools(false);
        setMessages(prev => [...prev, { role: 'user', content: label }]);
        setLoading(true);
        try {
            const res = await fetch(`/api/ai/insights?kind=${kind}`, { cache: 'no-store' });
            const data = await res.json();
            setMessages(prev => [...prev, res.ok && data.card
                ? { role: 'assistant', content: '', cards: [data.card] }
                : { role: 'assistant', content: data.error ?? 'تعذر إعداد البطاقة.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'حدث خطأ في الاتصال. يرجى المحاولة مجدداً.' }]);
        } finally { setLoading(false); }
    }, [loading, messages.length]);

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
                onClick: () => { setMessages([]); setShowPurchase(false); setShowTools(false); },
            },
            cancel: {
                label: 'إلغاء',
                onClick: () => {},
            },
            duration: 6000,
        });
    };

    const atMsgLimit = messages.length >= MAX_MESSAGES;
    const atDailyLimit = usage !== null && usage.remaining <= 0;
    const purchaseCommand = !!monthlyStockoutRequest(input);
    const isDisabled = atMsgLimit || (atDailyLimit && !purchaseCommand);

    return (
        <>
            <button onClick={() => setIsOpen(v => !v)} title="المساعد الذكي" aria-label="فتح المساعد الذكي" aria-expanded={isOpen}
                className="fixed bottom-6 left-6 z-[60] flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                {isOpen ? <X size={24} /> : <Bot size={26} />}
            </button>
            {isOpen && (
                <section dir="rtl" role="dialog" aria-label="المساعد الذكي" onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false); }}
                    className={`fixed bottom-24 left-2 right-2 z-[60] flex h-[min(760px,calc(100dvh-112px))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:left-6 sm:right-auto ${expanded ? 'sm:w-[min(720px,calc(100vw-48px))]' : 'sm:w-[440px] sm:max-w-[calc(100vw-48px)]'}`}>
                    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot size={23} /></div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-foreground">مساعد فاراماس</h2>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{usage ? `${usage.remaining} من ${usage.limit} إجابة متبقية اليوم` : 'مبيعاتك ومخزونك في محادثة واحدة'}</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                            <button aria-label="أمثلة على الأسئلة" title="أمثلة على الأسئلة" onClick={() => { setShowExamples(v => !v); setShowTools(false); }} className={`rounded-xl p-2 hover:bg-muted ${showExamples ? 'bg-primary/10 text-primary' : ''}`}><Lightbulb size={17} /></button>
                            <button aria-label={expanded ? 'تصغير المحادثة' : 'توسيع المحادثة'} title="تغيير حجم المحادثة" onClick={() => setExpanded(v => !v)} className="hidden rounded-xl p-2 hover:bg-muted sm:block">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
                            {messages.length > 0 && <button onClick={clearChat} aria-label="مسح المحادثة" title="مسح المحادثة" className="rounded-xl p-2 hover:bg-muted"><Trash2 size={16} /></button>}
                            <button onClick={() => setIsOpen(false)} aria-label="إغلاق المساعد" className="rounded-xl p-2 hover:bg-muted"><X size={18} /></button>
                        </div>
                    </header>
                    <div className="relative flex min-h-0 flex-1 flex-col">
                        {showExamples ? (
                            <div className="flex min-h-0 flex-1 flex-col bg-card">
                                <div className="flex items-center gap-2 px-4 pt-4">
                                    <button onClick={() => setShowExamples(false)} aria-label="العودة إلى المحادثة" className="rounded-lg p-1.5 text-primary hover:bg-primary/10"><ArrowRight size={18} /></button>
                                    <div><h3 className="text-sm font-bold">أمثلة على الأسئلة</h3><p className="text-xs text-muted-foreground">اختر الموضوع، ثم السؤال لإرساله.</p></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 border-b border-border p-4">
                                    {EXAMPLE_CATEGORIES.map((cat, idx) => (
                                        <button key={cat.label} onClick={() => setActiveTab(idx)} aria-pressed={activeTab === idx}
                                            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right text-xs transition ${activeTab === idx ? 'border-primary bg-primary/10 font-bold text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                                            <span aria-hidden="true">{cat.icon}</span>{cat.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                                    {EXAMPLE_CATEGORIES[activeTab].questions.map(q => (
                                        <button key={q} onClick={() => sendMessage(q)} disabled={loading || atMsgLimit || atDailyLimit || !configured}
                                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-3 text-right text-sm leading-relaxed transition hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40">
                                            <span>{q}</span><ChevronLeft size={15} className="shrink-0 text-primary" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/20 p-4" role="log" aria-label="رسائل المحادثة" aria-live="polite">
                                {messages.length === 0 && !showPurchase && (
                                    <div className="py-5">
                                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles size={24} /></div>
                                        <h3 className="text-xl font-bold">كيف أساعدك اليوم؟</h3>
                                        <p className="mt-2 text-sm leading-7 text-muted-foreground">اسأل عن أداء الصيدلية، أو اختر أداة لتراجع المخزون وتجهّز طلب شراء.</p>
                                        <div className="mt-5 grid grid-cols-2 gap-2">
                                            {QUICK_QUESTIONS.map(q => <button key={q} onClick={() => sendMessage(q)} disabled={!configured || atDailyLimit || loading}
                                                className="rounded-2xl border border-border bg-card px-3 py-3 text-right text-xs leading-6 text-foreground transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-40">{q}</button>)}
                                        </div>
                                        <button onClick={() => { setShowPurchase(true); setPurchaseDays(''); }} disabled={atMsgLimit || loading}
                                            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-3 text-right hover:bg-primary/10">
                                            <ShoppingCart size={19} className="shrink-0 text-primary" /><span className="flex-1"><span className="block text-sm font-semibold">طلب شراء ذكي</span><span className="mt-1 block text-xs text-muted-foreground">اختر مدة التغطية وجهّز مسودة للمراجعة</span></span><ChevronLeft size={17} className="text-primary" />
                                        </button>
                                        <button onClick={() => setShowExamples(true)} className="mt-4 flex items-center gap-1 text-xs text-primary"><Lightbulb size={14} />استكشف أمثلة الأسئلة<ChevronLeft size={13} /></button>
                                    </div>
                                )}
                                {messages.map((msg, i) => (
                                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                        {msg.role === 'assistant' && <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bot size={16} /></div>}
                                        <div className={`${msg.cards?.length ? 'min-w-0 flex-1' : 'max-w-[88%]'} whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7 ${msg.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tr-sm border border-border bg-card text-foreground'}`}>
                                            {msg.content}
                                            {msg.cards?.map((card, j) => <div key={j} className={`whitespace-normal ${msg.content ? 'mt-3' : ''}`}><AssistantCardView card={card} /></div>)}
                                        </div>
                                    </div>
                                ))}
                                {showPurchase && (
                                    <div className="rounded-2xl border border-primary/25 bg-card p-4" data-testid="purchase-setup">
                                        <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold"><ShoppingCart size={18} className="text-primary" />طلب شراء ذكي</h3><button aria-label="إلغاء إعداد طلب الشراء" onClick={() => setShowPurchase(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X size={16} /></button></div>
                                        <p className="mt-3 text-sm leading-7 text-muted-foreground">سأبحث عن الأدوية النافدة التي بيعت هذا الشهر. كم يوماً تريد أن تكفي الكمية المقترحة؟</p>
                                        <div className="mt-3 flex gap-2">{[5, 10, 15, 20].map(d => <button key={d} onClick={() => setPurchaseDays(String(d))} aria-pressed={purchaseDays === String(d)} className={`flex-1 rounded-xl border py-2 text-xs ${purchaseDays === String(d) ? 'border-primary bg-primary/10 font-bold text-primary' : 'border-border hover:bg-muted'}`}>{d} أيام</button>)}</div>
                                        <label className="mt-4 block text-xs font-medium" htmlFor="assistant-coverage">أو أدخل مدة أخرى (من 1 إلى 365 يوماً)</label>
                                        <input id="assistant-coverage" type="text" inputMode="numeric" autoComplete="off" value={purchaseDays} onChange={e => setPurchaseDays(e.target.value.replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d) >= 0 ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))}
                                            className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm" placeholder="عدد أيام التغطية" disabled={loading} />
                                        {purchaseDays && !validPurchaseDays && <p className="mt-1 text-xs text-destructive" role="alert">أدخل عدداً صحيحاً من 1 إلى 365.</p>}
                                        <button onClick={() => sendMessage(`جهز طلب الأدوية النافدة التي بيعت هذا الشهر بكمية تكفي لمدة ${Number(purchaseDays)} يوم`)} disabled={!validPurchaseDays || loading || atMsgLimit}
                                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"><ShoppingCart size={16} />تجهيز الاقتراح</button>
                                        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">ستراجع الأصناف والكميات قبل إرسال الطلب إلى المذخر.</p>
                                    </div>
                                )}
                                {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 size={16} className="animate-spin text-primary" />أراجع بيانات الصيدلية…</div>}
                                {!configured && <p className="rounded-xl bg-muted px-3 py-2 text-xs leading-6 text-muted-foreground">الإجابات النصية غير متاحة حالياً. يمكنك استخدام أدوات المخزون وطلب الشراء.</p>}
                                {atMsgLimit && <div className="text-center text-xs text-muted-foreground">وصلت إلى 40 رسالة. <button onClick={() => { setMessages([]); setShowPurchase(false); }} className="text-primary hover:underline">ابدأ محادثة جديدة</button></div>}
                                {atDailyLimit && <p className="text-xs leading-6 text-muted-foreground">اكتملت حصة الإجابات النصية اليوم. أدوات المخزون وطلب الشراء متاحة؛ تتجدد الحصة منتصف الليل بتوقيت بغداد.</p>}
                                <div ref={bottomRef} />
                            </div>
                        )}
                        {showTools && !showExamples && (
                            <div className="shrink-0 border-t border-border bg-card p-3" data-testid="assistant-tools">
                                <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">أدوات من بيانات الصيدلية</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => { setShowPurchase(true); setPurchaseDays(''); setShowTools(false); }} disabled={loading || atMsgLimit} className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-right text-xs font-semibold text-primary"><ShoppingCart size={16} />طلب شراء ذكي</button>
                                    <button onClick={() => runInsight('reorder', 'احتياجات المخزون')} disabled={loading || atMsgLimit} className="flex items-center gap-2 rounded-xl border border-border p-3 text-right text-xs hover:bg-muted"><Package size={16} />احتياجات المخزون</button>
                                    <button onClick={() => runInsight('waste', 'المخزون المعرض للهدر')} disabled={loading || atMsgLimit} className="flex items-center gap-2 rounded-xl border border-border p-3 text-right text-xs hover:bg-muted"><Package size={16} />المخزون المعرض للهدر</button>
                                    <button onClick={() => runInsight('daily', 'ملخص اليوم')} disabled={loading || atMsgLimit} className="flex items-center gap-2 rounded-xl border border-border p-3 text-right text-xs hover:bg-muted"><ClipboardList size={16} />ملخص اليوم</button>
                                </div>
                            </div>
                        )}
                        <footer className="shrink-0 border-t border-border bg-card p-3">
                            <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
                                <button onClick={() => { setShowTools(v => !v); setShowExamples(false); }} aria-label="أدوات المساعد" title="أدوات المساعد" aria-expanded={showTools} className={`shrink-0 rounded-xl p-2 transition hover:bg-muted ${showTools ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}><Plus size={19} /></button>
                                <textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`; }} onKeyDown={handleKeyDown}
                                    aria-label="رسالتك للمساعد" placeholder={atMsgLimit ? 'ابدأ محادثة جديدة للمتابعة' : 'اكتب سؤالك أو اختر أداة…'} disabled={loading || atMsgLimit} rows={1}
                                    className="max-h-28 min-h-[36px] min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-sm placeholder:text-muted-foreground focus:!shadow-none focus:outline-none disabled:opacity-50" />
                                <button onClick={() => sendMessage(input)} aria-label="إرسال الرسالة" disabled={!input.trim() || loading || isDisabled || (!configured && !purchaseCommand)}
                                    className="shrink-0 rounded-xl bg-primary p-2.5 text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
                            </div>
                            <p className="mt-2 text-center text-[10px] text-muted-foreground">Enter للإرسال · Shift+Enter لسطر جديد</p>
                        </footer>
                    </div>
                </section>
            )}
        </>
    );
}
