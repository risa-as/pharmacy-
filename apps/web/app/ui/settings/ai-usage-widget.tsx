'use client';

import { useEffect, useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';

interface UsageData {
  limit: number;
  used: number;
  remaining: number;
}

export default function AIUsageWidget() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/usage')
      .then(r => r.json())
      .then(d => { if (d.limit !== undefined) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pct = data ? Math.round((data.used / data.limit) * 100) : 0;
  const color = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-violet-500';

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جاري التحميل...</span>
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">تعذّر تحميل بيانات الاستخدام</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">الاستخدام اليوم</span>
            <span className="font-bold text-foreground">{data.used} / {data.limit} رسالة</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${color}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>المتبقي: <span className="font-bold text-foreground">{data.remaining} رسالة</span></span>
            <span>يتجدد منتصف الليل (بغداد)</span>
          </div>
        </>
      )}
    </div>
  );
}
