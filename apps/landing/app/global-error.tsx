'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', padding: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '5rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>500</h1>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#334155', margin: '0.5rem 0 1rem' }}>حدث خطأ غير متوقع</h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>نعتذر، حدث خطأ في الخادم. يرجى المحاولة مرة أخرى.</p>
          <button
            onClick={reset}
            style={{ background: '#0f7575', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            حاول مجدداً
          </button>
        </div>
      </body>
    </html>
  );
}
