import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';

function setup(options: { shift?: boolean; cashFailure?: boolean } = {}) {
    const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const start = source.indexOf('ipcMain.handle(\n  "add-debt-payment",');
    const end = source.indexOf('// ===== IPC Handlers for Dead-Letter', start);
    if (start < 0 || end < 0) throw Error('Debt handler not found');
    const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    let handler: any;
    const state = { balance: 70, cash: 100, payments: [] as any[], movements: [] as any[] };
    const tx = {
        patient: { findUnique: async () => ({ balance: state.balance }), update: async (a: any) => { state.balance -= a.data.balance.decrement; return { balance: state.balance }; } },
        shift: { findFirst: async () => options.shift === false ? null : { safeId: 'drawer' } },
        debtPayment: { create: async (a: any) => { const p = { id: 'payment', ...a.data }; state.payments.push(p); return p; } },
        transaction: { create: async (a: any) => { state.movements.push(a.data); return a.data; } },
        safe: { update: async (a: any) => { if (options.cashFailure) throw Error('cash write failed'); state.cash += a.data.balance.increment; } },
        companySettings: { findFirst: async () => ({ loyaltyEnabled: false }) },
    };
    const findSale = vi.fn(async () => ({ id: 'credit-sale' }));
    const db = { patient: { findFirst: async () => ({ id: 'patient' }) }, sale: { findFirst: findSale },
        $transaction: async (fn: any) => { const old = structuredClone(state); try { return await fn(tx); } catch (e) { Object.assign(state, old); throw e; } } };
    new Function('ipcMain', 'prisma', 'authorizeOperations', 'store', code)(
        { handle: (_: string, fn: any) => { handler = fn; } }, db,
        async () => ({ who: { id: 'employee', branch: 'branch' }, assertCurrent() {} }), { get: () => 'employee' },
    );
    return { state, findSale, pay: (amount = 7) => handler(null, { patientId: 'patient', amount }) };
}

it('records collector, cash and debt together and transports cash with the payment only', async () => {
    const h = setup();
    expect((await h.pay()).success).toBe(true);
    expect(h.state).toMatchObject({ balance: 63, cash: 107 });
    expect(h.state.movements).toEqual([expect.objectContaining({ referenceType: 'DEBT_PAYMENT', referenceId: 'payment', safeId: 'drawer', userId: 'employee', amount: 7, type: 'IN', synced: true })]);
    expect(h.findSale).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient', payment: { method: 'CREDIT' } } }));
});
it('does not collect without a drawer, for invalid amounts, or above the outstanding debt', async () => {
    for (const amount of [0, -1, NaN, 71]) {
        const h = setup(); expect((await h.pay(amount)).success).toBe(false);
        expect(h.state).toEqual({ balance: 70, cash: 100, payments: [], movements: [] });
    }
    const h = setup({ shift: false }); expect((await h.pay()).success).toBe(false);
    expect(h.state.payments).toEqual([]);
});
it('propagates cash write failures to the transaction so collection cannot partially commit', async () => {
    const h = setup({ cashFailure: true }); expect((await h.pay()).success).toBe(false);
    expect(h.state).toEqual({ balance: 70, cash: 100, payments: [], movements: [] });
});
