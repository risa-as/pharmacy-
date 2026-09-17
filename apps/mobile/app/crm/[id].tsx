import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { crmService, Patient } from '../../services/crm';
import { request } from '../../services/api';
import { Radius } from '../../constants/colors';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { usePalette, Surface, IconTile, SectionTitle, StatusBadge, InfoNote, StateBlock, Tone } from '../../components/ui/Kit';
import { InvoiceItemsTable, InvoiceNumberChip, InvoiceItemRow } from '../../components/sales/InvoiceParts';
import { formatDate, formatTime } from '../../utils/date';
import { formatNumber, formatIQD, formatInvoiceNumber, paymentMethodLabel, CURRENCY } from '../../utils/format';

/** GET /sales/[id] — the parts of an invoice this screen shows. */
interface SaleDetail {
    id: string;
    total?: number;
    discount?: number;
    payment?: { method?: string | null } | null;
    items: InvoiceItemRow[];
    returns: { id: string; total: number; items: { drugId: string; quantity: number }[] }[];
}

/**
 * Patient file (design patient-detail.png): recorded health information and
 * purchase history. Shows what is recorded — no diagnosis or treatment advice.
 */
export default function PatientDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const C = usePalette();
    const insets = useSafeAreaInsets();
    const [patient, setPatient] = useState<Patient | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    // Invoice details, loaded per card the first time it is opened. One card at
    // a time, as in the sales history.
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [details, setDetails] = useState<Record<string, SaleDetail>>({});
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    const [detailFailed, setDetailFailed] = useState<Record<string, boolean>>({});

    const openSale = useCallback((saleId: string) => {
        const willExpand = expandedId !== saleId;
        setExpandedId(willExpand ? saleId : null);
        if (!willExpand || details[saleId] || detailLoading === saleId) return;
        setDetailLoading(saleId);
        request<SaleDetail>(`/sales/${saleId}`)
            .then(d => {
                setDetails(prev => ({ ...prev, [saleId]: d }));
                setDetailFailed(prev => ({ ...prev, [saleId]: false }));
            })
            .catch(err => {
                console.error('PatientDetailScreen invoice:', err);
                setDetailFailed(prev => ({ ...prev, [saleId]: true }));
            })
            .finally(() => setDetailLoading(current => (current === saleId ? null : current)));
    }, [expandedId, details, detailLoading]);

    const fetchPatient = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            setPatient(await crmService.getPatient(id as string));
        } catch (error) {
            console.error(error);
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { if (id) fetchPatient(); }, [fetchPatient, id]);

    const header = <ScreenHeader title="ملف المريض" fallbackHref={'/crm' as Href} />;

    if (loading) return <View style={{ flex: 1, backgroundColor: C.background }}>{header}<StateBlock loading title="جارِ تحميل الملف…" /></View>;
    if (failed || !patient) return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <StateBlock
                icon={failed ? 'cloud-offline-outline' : 'person-outline'}
                title={failed ? 'تعذّر تحميل الملف' : 'لم يتم العثور على المريض'}
                actionLabel={failed ? 'إعادة المحاولة' : undefined}
                onAction={failed ? fetchPatient : undefined}
            />
        </View>
    );

    const allergies = (patient.allergies ?? []).filter(Boolean);
    const chronic = (patient.chronicDiseases ?? []).filter(Boolean);

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {header}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
                <Surface style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 14 }}>
                    <IconTile icon="person-outline" size={56} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: C.foreground, fontSize: 20, fontWeight: '900', textAlign: 'right' }}>{patient.name}</Text>
                        <Text style={{ color: C.mutedForeground, fontSize: 15, textAlign: 'right', marginTop: 2, writingDirection: 'ltr' }}>{patient.phone}</Text>
                    </View>
                </Surface>

                <View>
                    <SectionTitle title="معلومات مسجلة" />
                    <Surface style={{ gap: 10 }}>
                        <InfoBlock
                            icon="alert-circle-outline"
                            tone={allergies.length ? 'danger' : 'neutral'}
                            title="الحساسيات"
                            items={allergies}
                            empty="لا توجد حساسيات مسجلة"
                        />
                        <InfoBlock
                            icon="pulse-outline"
                            tone={chronic.length ? 'warning' : 'neutral'}
                            title="الأمراض المزمنة"
                            items={chronic}
                            empty="لا توجد أمراض مزمنة مسجلة"
                        />
                        <InfoBlock
                            icon="document-text-outline"
                            tone="primary"
                            title="الملاحظات"
                            items={patient.notes ? [patient.notes] : []}
                            empty="لا توجد ملاحظات"
                        />
                    </Surface>
                </View>

                <View>
                    <SectionTitle title="سجل المشتريات" />
                    {patient.sales && patient.sales.length > 0 ? (
                        <View style={{ gap: 10 }}>
                            {patient.sales.map((sale: any) => (
                                <PurchaseCard
                                    key={sale.id}
                                    sale={sale}
                                    expanded={expandedId === sale.id}
                                    detail={details[sale.id]}
                                    loading={detailLoading === sale.id}
                                    failed={!!detailFailed[sale.id]}
                                    onToggle={() => openSale(sale.id)}
                                />
                            ))}
                        </View>
                    ) : (
                        <Surface><Text style={{ color: C.mutedForeground, textAlign: 'center' }}>لا توجد مشتريات سابقة</Text></Surface>
                    )}
                </View>

                <InfoNote text="بيانات مسجلة في ملف المريض، وليست تقييماً طبياً." />
            </ScrollView>
        </View>
    );
}

/**
 * One past invoice, styled like the sales-history card: total, payment badge,
 * time and invoice number in one row, opening into the invoice's lines.
 * Read-only — returns stay in the sales history, where the branch is checked.
 */
function PurchaseCard({ sale, expanded, detail, loading, failed, onToggle }: {
    sale: any; expanded: boolean; detail?: SaleDetail; loading: boolean; failed: boolean; onToggle: () => void;
}) {
    const C = usePalette();
    const method = detail?.payment?.method ?? sale.payment?.method ?? (sale.patientId && !sale.safeId ? 'CREDIT' : 'CASH');
    const tone: Tone = method === 'CREDIT' ? 'warning' : method === 'CARD' ? 'primary' : 'success';
    const when = sale.createdAt
        ? `${formatDate(sale.createdAt, { day: 'numeric', month: 'short' })} · ${formatTime(sale.createdAt, { hour: '2-digit', minute: '2-digit' })}`
        : '--';

    return (
        <Surface padded={false} style={{ overflow: 'hidden', borderColor: expanded ? C.primary : C.border }}>
            <TouchableOpacity
                onPress={onToggle}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`فاتورة ${formatInvoiceNumber(sale)}`}
                style={{ padding: 14, gap: 6 }}
            >
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                    <Text style={{ color: C.foreground, fontSize: 18, fontWeight: '900' }}>
                        {formatNumber(sale.total ?? 0)} <Text style={{ fontSize: 12, color: C.mutedForeground }}>{CURRENCY}</Text>
                    </Text>
                    <StatusBadge label={paymentMethodLabel(method)} tone={tone} />
                    <View style={{ flex: 1 }} />
                    <InvoiceNumberChip label={formatInvoiceNumber(sale)} />
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.mutedForeground} />
                </View>
                {/* Date on its own line: there is no day grouping here, so the
                    full date would crowd the invoice number. */}
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="time-outline" size={13} color={C.mutedForeground} />
                    <Text style={{ flexShrink: 1, color: C.mutedForeground, fontSize: 12.5 }} numberOfLines={1}>{when}</Text>
                </View>
            </TouchableOpacity>

            {expanded && (
                <View style={{ borderTopWidth: 1, borderTopColor: C.border, padding: 14, gap: 10 }}>
                    {loading ? (
                        <ActivityIndicator size="small" color={C.primary} style={{ marginVertical: 10 }} />
                    ) : detail ? (
                        <>
                            <Text style={{ color: C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>التفاصيل</Text>
                            <InvoiceItemsTable
                                items={detail.items ?? []}
                                total={sale.total ?? 0}
                                returnedByDrug={returnedByDrug(detail)}
                            />
                            {(sale.discount ?? 0) > 0 && (
                                <DetailRow label="الخصم" value={formatIQD(sale.discount)} tone="warning" />
                            )}
                            {(detail.returns?.length ?? 0) > 0 && (
                                <DetailRow
                                    label="مرتجعات"
                                    value={`${formatNumber(detail.returns.length)} — ${formatIQD(detail.returns.reduce((s, r) => s + (r.total ?? 0), 0))}`}
                                    tone="danger"
                                />
                            )}
                        </>
                    ) : (
                        <Text style={{ color: failed ? C.danger : C.mutedForeground, fontSize: 13, textAlign: 'right' }}>
                            {failed ? 'تعذّر تحميل تفاصيل الفاتورة — أعد المحاولة.' : 'جاري تحميل التفاصيل...'}
                        </Text>
                    )}
                </View>
            )}
        </Surface>
    );
}

/** Returned quantity per drug in this invoice. */
function returnedByDrug(detail: SaleDetail): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of detail.returns ?? []) for (const ri of r.items ?? []) {
        map[ri.drugId] = (map[ri.drugId] ?? 0) + ri.quantity;
    }
    return map;
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'danger' }) {
    const C = usePalette();
    return (
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: C.mutedForeground, fontSize: 13 }}>{label}</Text>
            <Text style={{ color: tone === 'warning' ? C.warning : tone === 'danger' ? C.danger : C.foreground, fontSize: 14, fontWeight: '700' }}>{value}</Text>
        </View>
    );
}

function InfoBlock({ icon, tone, title, items, empty }: {
    icon: React.ComponentProps<typeof Ionicons>['name']; tone: Tone; title: string; items: string[]; empty: string;
}) {
    const C = usePalette();
    const highlighted = tone === 'danger' && items.length > 0;
    return (
        <View style={{
            flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, padding: 12,
            borderRadius: Radius.control, borderWidth: 1,
            borderColor: highlighted ? `${C.danger}40` : C.border,
            backgroundColor: highlighted ? C.dangerBg : C.card,
        }}>
            <IconTile icon={icon} tone={tone} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: highlighted ? C.danger : C.foreground, fontSize: 15, fontWeight: '800', textAlign: 'right' }}>{title}</Text>
                {items.length === 0 ? (
                    <Text style={{ color: C.mutedForeground, fontSize: 13.5, textAlign: 'right' }}>{empty}</Text>
                ) : (
                    items.map((it, i) => (
                        <Text key={i} style={{ color: C.foreground, fontSize: 14, textAlign: 'right', lineHeight: 21 }}>{items.length > 1 ? `• ${it}` : it}</Text>
                    ))
                )}
            </View>
        </View>
    );
}
