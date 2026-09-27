/**
 * Result of submitting a purchase receipt, shared by web, mobile and desktop.
 *
 * Only a successful response is a success. A 409 or any other error is never
 * read as "received": the server's code says whether the document was already
 * received or cancelled, anything else refused is a rejection. When no answer
 * arrived (network loss, timeout, gateway error) the caller reads the document
 * status first and only then decides.
 */
export const RECEIPT_ERROR_CODES = {
  ALREADY_RECEIVED: 'PURCHASE_ALREADY_RECEIVED',
  CANCELLED: 'PURCHASE_CANCELLED',
} as const;

/** What a client knows about a failed submission. No `status` means no answer. */
export type ReceiptFailure = { status?: number; code?: string; message?: string; lost?: boolean };

export type ReceiptOutcomeKind =
  | 'RECEIVED'
  | 'ALREADY_RECEIVED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'RECEIVED_AFTER_LOST_RESPONSE'
  | 'NOT_RECEIVED_AFTER_LOST_RESPONSE'
  | 'UNCONFIRMED';

export type ReceiptOutcome = {
  kind: ReceiptOutcomeKind;
  tone: 'success' | 'warning' | 'error';
  title: string;
  message: string;
  /** The document is no longer awaiting receipt: leave the form. */
  closed: boolean;
  /** Sending again is safe: the server confirmed nothing was received. */
  canRetry: boolean;
};

const outcome = (kind: ReceiptOutcomeKind, tone: ReceiptOutcome['tone'], title: string, message: string, closed: boolean, canRetry: boolean): ReceiptOutcome =>
  ({ kind, tone, title, message, closed, canRetry });

export const receiptSucceeded = () =>
  outcome('RECEIVED', 'success', 'تم الاستلام', 'أُضيفت المواد إلى الدفعات والمخزون.', true, false);

const alreadyReceived = () =>
  outcome('ALREADY_RECEIVED', 'warning', 'مستلم سابقاً',
    'هذه الفاتورة استُلمت سابقاً، ولم يُضف هذا الطلب أي كمية. راجع دفعات المستند قبل أي إجراء.', true, false);
const cancelled = () =>
  outcome('CANCELLED', 'error', 'ملغى', 'هذه الفاتورة ملغاة؛ لا يمكن استلامها، ولم تُضف أي كمية.', true, false);

/** True when no definite answer arrived, so the document must be read before judging. */
export function receiptNeedsStatusCheck(failure: ReceiptFailure): boolean {
  const status = failure.status;
  return !!failure.lost || typeof status !== 'number' || !Number.isFinite(status) || status === 408 || status >= 500;
}

export function classifyReceiptFailure(failure: ReceiptFailure, documentStatus?: string | null): ReceiptOutcome {
  if (failure.code === RECEIPT_ERROR_CODES.ALREADY_RECEIVED) return alreadyReceived();
  if (failure.code === RECEIPT_ERROR_CODES.CANCELLED) return cancelled();
  if (!receiptNeedsStatusCheck(failure)) {
    const reason = failure.message?.trim();
    return outcome('REJECTED', 'error', 'مرفوض',
      `رفض الخادم الاستلام، ولم تُضف أي كمية.${reason ? ` السبب: ${reason}` : ''}`, false, false);
  }
  if (documentStatus === 'COMPLETED')
    return outcome('RECEIVED_AFTER_LOST_RESPONSE', 'warning', 'مستلم (بعد التحقق)',
      'انقطع الرد، ثم تحقّقنا من الخادم: المستند الآن مستلم. راجع الدفعات المُدخلة قبل المتابعة، ولا تُعد الإرسال.', true, false);
  if (documentStatus === 'CANCELLED') return cancelled();
  if (documentStatus === 'PENDING')
    return outcome('NOT_RECEIVED_AFTER_LOST_RESPONSE', 'error', 'لم يكتمل الاستلام',
      'انقطع الرد، ثم تحقّقنا من الخادم: المستند ما زال بانتظار الاستلام ولم تُضف أي كمية. يمكنك إعادة المحاولة.', false, true);
  return outcome('UNCONFIRMED', 'error', 'حالة الاستلام غير مؤكدة',
    'انقطع الرد وتعذّر التحقق من حالة المستند. لا تُعد الإرسال قبل تحديث السجل والتأكد من حالته.', false, false);
}

const toFailure = (error: unknown): ReceiptFailure => {
  if (!error || typeof error !== 'object') return {};
  const e = error as Record<string, unknown>;
  return {
    status: typeof e.status === 'number' ? e.status : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
    message: typeof e.message === 'string' ? e.message : undefined,
    lost: e.lost === true,
  };
};

/**
 * Send one receipt and judge the result. `send` resolves only on success and
 * rejects with `{ status?, code?, message?, lost? }` otherwise; it is called once.
 * `readStatus` reads the document status from the server and is used only when
 * the answer was lost.
 */
export async function settleReceipt(send: () => Promise<unknown>, readStatus: () => Promise<string | null | undefined>): Promise<ReceiptOutcome> {
  try {
    await send();
    return receiptSucceeded();
  } catch (error) {
    const failure = toFailure(error);
    if (!receiptNeedsStatusCheck(failure) || failure.code) return classifyReceiptFailure(failure);
    const status = await readStatus().catch(() => null);
    return classifyReceiptFailure(failure, status);
  }
}

/**
 * Whether the confirm button must stay disabled after this outcome: the document
 * is closed, or it is unknown whether the last submission was applied. After a
 * rejection (entries can be corrected) or a confirmed non-receipt, sending again is
 * allowed. Web, mobile and desktop all use this rule.
 */
export function receiptResendBlocked(outcome: ReceiptOutcome | null): boolean {
  return !!outcome && (outcome.closed || outcome.kind === 'UNCONFIRMED');
}

/** "Check the document" after an unconfirmed result: reads the status again. */
export async function recheckReceipt(readStatus: () => Promise<string | null | undefined>): Promise<ReceiptOutcome> {
  const status = await readStatus().catch(() => null);
  return classifyReceiptFailure({ lost: true }, status);
}
