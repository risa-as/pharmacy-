// Stub: replaced by the implementation in the next commit (tests are written first).
export const RECEIPT_ERROR_CODES = { ALREADY_RECEIVED: 'PURCHASE_ALREADY_RECEIVED', CANCELLED: 'PURCHASE_CANCELLED' } as const;
export type ReceiptFailure = { status?: number; code?: string; message?: string; lost?: boolean };
export type ReceiptOutcomeKind = 'RECEIVED' | 'ALREADY_RECEIVED' | 'CANCELLED' | 'REJECTED' | 'RECEIVED_AFTER_LOST_RESPONSE' | 'NOT_RECEIVED_AFTER_LOST_RESPONSE' | 'UNCONFIRMED';
export type ReceiptOutcome = { kind: ReceiptOutcomeKind; tone: 'success' | 'warning' | 'error'; title: string; message: string; closed: boolean; canRetry: boolean };
export function receiptNeedsStatusCheck(_failure: ReceiptFailure): boolean { throw new Error('not implemented'); }
export function receiptSucceeded(): ReceiptOutcome { throw new Error('not implemented'); }
export function classifyReceiptFailure(_failure: ReceiptFailure, _documentStatus?: string | null): ReceiptOutcome { throw new Error('not implemented'); }
export async function settleReceipt(_send: () => Promise<unknown>, _readStatus: () => Promise<string | null | undefined>): Promise<ReceiptOutcome> { throw new Error('not implemented'); }
