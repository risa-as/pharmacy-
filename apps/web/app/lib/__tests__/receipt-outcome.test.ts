import { describe, expect, it, vi } from 'vitest';
import { classifyReceiptFailure, receiptNeedsStatusCheck, receiptSucceeded, settleReceipt, RECEIPT_ERROR_CODES } from '../../../../../packages/shared/src/receipt-outcome';

// One classification for web, mobile and desktop: a failed or unanswered receipt
// is never reported as a successful one.
describe('receipt outcome', () => {
  it('only a successful response is a success', () => {
    expect(receiptSucceeded()).toMatchObject({ kind: 'RECEIVED', tone: 'success', closed: true });
  });

  it('already received (409 + code) is its own result, not a success', () => {
    const o = classifyReceiptFailure({ status: 409, code: RECEIPT_ERROR_CODES.ALREADY_RECEIVED, message: 'x' });
    expect(o).toMatchObject({ kind: 'ALREADY_RECEIVED', closed: true, canRetry: false });
    expect(o.tone).not.toBe('success');
    expect(o.title).toBe('مستلم سابقاً');
  });

  it('cancelled (409 + code) says cancelled', () => {
    const o = classifyReceiptFailure({ status: 409, code: RECEIPT_ERROR_CODES.CANCELLED });
    expect(o).toMatchObject({ kind: 'CANCELLED', tone: 'error', closed: true, canRetry: false });
    expect(o.title).toBe('ملغى');
  });

  it('a 409 without a known code is a rejection with the server reason', () => {
    const o = classifyReceiptFailure({ status: 409, message: 'تعذر مطابقة صنف الاستلام.' });
    expect(o).toMatchObject({ kind: 'REJECTED', tone: 'error', closed: false });
    expect(o.title).toBe('مرفوض');
    expect(o.message).toContain('تعذر مطابقة صنف الاستلام.');
  });

  it('a validation or permission error is a rejection', () => {
    expect(classifyReceiptFailure({ status: 400, message: 'رقم الدفعة مطلوب.' }).kind).toBe('REJECTED');
    expect(classifyReceiptFailure({ status: 403, message: 'ليس لديك صلاحية' }).kind).toBe('REJECTED');
  });

  it('a definite answer never needs a status check; a lost one always does', () => {
    expect(receiptNeedsStatusCheck({ status: 409, code: RECEIPT_ERROR_CODES.ALREADY_RECEIVED })).toBe(false);
    expect(receiptNeedsStatusCheck({ status: 400 })).toBe(false);
    expect(receiptNeedsStatusCheck({ lost: true })).toBe(true);
    expect(receiptNeedsStatusCheck({})).toBe(true);
    expect(receiptNeedsStatusCheck({ status: 502 })).toBe(true);
    expect(receiptNeedsStatusCheck({ status: 504 })).toBe(true);
  });

  it('lost response: document now received → received, said as verified after the loss', () => {
    const o = classifyReceiptFailure({ lost: true }, 'COMPLETED');
    expect(o).toMatchObject({ kind: 'RECEIVED_AFTER_LOST_RESPONSE', closed: true, canRetry: false });
    expect(o.message).toContain('تحقّقنا');
  });

  it('lost response: document still pending → nothing was received, retry allowed', () => {
    expect(classifyReceiptFailure({ lost: true }, 'PENDING')).toMatchObject({ kind: 'NOT_RECEIVED_AFTER_LOST_RESPONSE', closed: false, canRetry: true });
  });

  it('lost response: document cancelled → cancelled', () => {
    expect(classifyReceiptFailure({ lost: true }, 'CANCELLED').kind).toBe('CANCELLED');
  });

  it('lost response and the check also failed → unconfirmed, no retry', () => {
    for (const status of [undefined, null, 'SOMETHING_ELSE']) {
      const o = classifyReceiptFailure({ lost: true }, status);
      expect(o).toMatchObject({ kind: 'UNCONFIRMED', canRetry: false });
      expect(o.tone).not.toBe('success');
    }
  });

  it('a definite rejection is not overridden by a later document status', () => {
    expect(classifyReceiptFailure({ status: 400, message: 'x' }, 'COMPLETED').kind).toBe('REJECTED');
  });
});

describe('settleReceipt: send once, check the document only when the answer was lost', () => {
  const fail = (value: object) => () => Promise.reject(value);
  it('success', async () => {
    const readStatus = vi.fn();
    expect((await settleReceipt(() => Promise.resolve(), readStatus)).kind).toBe('RECEIVED');
    expect(readStatus).not.toHaveBeenCalled();
  });
  it('already received: no status check, not a success', async () => {
    const readStatus = vi.fn().mockResolvedValue('COMPLETED');
    const o = await settleReceipt(fail({ status: 409, code: RECEIPT_ERROR_CODES.ALREADY_RECEIVED }), readStatus);
    expect(o.kind).toBe('ALREADY_RECEIVED');
    expect(readStatus).not.toHaveBeenCalled();
  });
  it('cancelled', async () => {
    expect((await settleReceipt(fail({ status: 409, code: RECEIPT_ERROR_CODES.CANCELLED }), vi.fn())).kind).toBe('CANCELLED');
  });
  it('rejected', async () => {
    const o = await settleReceipt(fail(Object.assign(new Error('رقم الدفعة مطلوب.'), { status: 400 })), vi.fn());
    expect(o).toMatchObject({ kind: 'REJECTED' });
    expect(o.message).toContain('رقم الدفعة مطلوب.');
  });
  it('lost (network error, no status): reads the document and judges from it', async () => {
    const readStatus = vi.fn().mockResolvedValue('COMPLETED');
    expect((await settleReceipt(fail(new TypeError('Failed to fetch')), readStatus)).kind).toBe('RECEIVED_AFTER_LOST_RESPONSE');
    expect(readStatus).toHaveBeenCalledOnce();
    expect((await settleReceipt(fail({ lost: true }), vi.fn().mockResolvedValue('PENDING'))).kind).toBe('NOT_RECEIVED_AFTER_LOST_RESPONSE');
  });
  it('lost and the check fails too: unconfirmed', async () => {
    expect((await settleReceipt(fail({ lost: true }), vi.fn().mockRejectedValue(new Error('offline')))).kind).toBe('UNCONFIRMED');
  });
});
