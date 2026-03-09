import { prisma } from '@/app/lib/prisma';
import { auth } from '@/auth';

export default async function ShiftsTable({
    query,
    currentPage,
    date,
    tenantBranchWhere,
}: {
    query: string;
    currentPage: number;
    date: string;
    tenantBranchWhere: any;
}) {
    // Pagination logic
    const ITEMS_PER_PAGE = 20;
    const offset = (currentPage - 1) * ITEMS_PER_PAGE;

    // Date Logic
    const now = new Date();
    let startDate = new Date(0);
    let endDate = new Date();

    if (date === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (date === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
    } else if (date === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const shifts = await prisma.shift.findMany({
        where: {
            ...tenantBranchWhere,
            createdAt: { gte: startDate, lte: endDate },
            user: {
                name: { contains: query, mode: 'insensitive' }
            }
        },
        include: {
            user: {
                select: { name: true, email: true }
            }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: ITEMS_PER_PAGE,
        skip: offset
    });

    return (
        <div className="mt-6 flow-root">
            <div className="overflow-x-auto">
                <div className="rounded-lg bg-transparent p-2 md:pt-0 border border-border shadow-sm overflow-hidden">
                    <div className="md:hidden">
                        {/* Mobile View */}
                        {shifts?.map((shift: any) => {
                            const expected = shift.expectedCash || 0;
                            const actual = shift.actualCash || 0;
                            const variance = actual - expected;

                            return (
                                <div key={shift.id} className="mb-2 w-full rounded-md bg-card p-4 border border-border">
                                    <div className="flex items-center justify-between border-b border-border pb-4">
                                        <div>
                                            <div className="mb-2 flex items-center">
                                                <p className="font-bold text-foreground">{shift.user?.name || 'مستخدم محذوف'}</p>
                                            </div>
                                            <p className="text-sm text-muted-foreground">{new Date(shift.startTime).toLocaleString('ar-IQ')}</p>
                                        </div>
                                        <div>
                                            {shift.status === 'CLOSED' ? (
                                                <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-1 text-xs font-bold text-success ring-1 ring-inset ring-success/20">مغلقة</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary ring-1 ring-inset ring-primary/20">مفتوحة للعمل</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex w-full items-center justify-between pt-4">
                                        <div>
                                            <p className="font-bold text-foreground">{actual.toLocaleString()} د.ع</p>
                                            <p className="text-sm text-muted-foreground">الفعلي في الدرج</p>
                                        </div>
                                        <div className="text-left font-bold">
                                            {shift.status === 'CLOSED' && (
                                                <span className={variance < 0 ? 'text-destructive' : variance > 0 ? 'text-success' : 'text-muted-foreground'}>
                                                    {variance < 0 ? 'عجز' : variance > 0 ? 'زيادة' : 'مطابق'} ({Math.abs(variance).toLocaleString()})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop View */}
                    <table className="hidden min-w-full text-foreground md:table text-right text-sm">
                        <thead className="rounded-lg bg-card/50 font-medium">
                            <tr>
                                <th scope="col" className="px-4 py-3 font-normal text-muted-foreground">رقم الإقفال</th>
                                <th scope="col" className="px-3 py-3 font-normal text-muted-foreground">دخول الكاشير</th>
                                <th scope="col" className="px-3 py-3 font-normal text-muted-foreground">ميعاد الجرد (الإغلاق)</th>
                                <th scope="col" className="px-3 py-3 font-normal text-muted-foreground">رصيد افتتاحي</th>
                                <th scope="col" className="px-3 py-3 font-normal text-muted-foreground">متوقع بالدرج</th>
                                <th scope="col" className="px-3 py-3 font-bold text-foreground bg-primary/5">الفعلي والمستلم</th>
                                <th scope="col" className="px-3 py-3 font-bold text-center">الفرق (عجز/زيادة)</th>
                                <th scope="col" className="px-3 py-3 font-normal text-muted-foreground text-center">حالة الوردية</th>
                            </tr>
                        </thead>
                        <tbody className="bg-transparent">
                            {shifts?.map((shift: any) => {
                                const expected = shift.expectedCash || 0;
                                const actual = shift.actualCash || 0;
                                const variance = actual - expected;

                                return (
                                    <tr key={shift.id} className="w-full border-b border-border py-3 text-sm last-of-type:border-none hover:bg-muted/50 transition-colors">
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <p className="font-medium text-foreground">{shift.user?.name || 'مستخدم غير معروف'}</p>
                                                <span className="text-xs text-muted-foreground font-mono">#{shift.id.slice(0, 6)}</span>
                                            </div>
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground" dir="ltr">
                                            {new Date(shift.startTime).toLocaleTimeString('ar-IQ')} <br />
                                            <span className="text-xs">{new Date(shift.startTime).toLocaleDateString('ar-IQ')}</span>
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground" dir="ltr">
                                            {shift.endTime ? (
                                                <>
                                                    {new Date(shift.endTime).toLocaleTimeString('ar-IQ')} <br />
                                                    <span className="text-xs">{new Date(shift.endTime).toLocaleDateString('ar-IQ')}</span>
                                                </>
                                            ) : '-'}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground font-mono" dir="ltr">
                                            {shift.startingCash.toLocaleString()}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground font-mono" dir="ltr">
                                            {expected.toLocaleString()}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 font-bold text-foreground bg-primary/5 font-mono" dir="ltr">
                                            {shift.status === 'CLOSED' ? actual.toLocaleString() : '-'}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-center font-bold font-mono" dir="ltr">
                                            {shift.status === 'CLOSED' ? (
                                                <span className={variance < 0 ? 'text-destructive px-2 py-1 bg-destructive/10 rounded' : variance > 0 ? 'text-success px-2 py-1 bg-success/10 rounded' : 'text-muted-foreground'}>
                                                    {variance.toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/40">-</span>
                                            )}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-center">
                                            {shift.status === 'CLOSED' ? (
                                                <span className="inline-flex items-center justify-center rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success ring-1 ring-inset ring-success/20 w-16">
                                                    مغلقة
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary ring-1 ring-inset ring-primary/20 w-16">
                                                    مفتوحة
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}

                            {shifts.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                                        لا توجد ورديات مطابقة لعملية البحث
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
