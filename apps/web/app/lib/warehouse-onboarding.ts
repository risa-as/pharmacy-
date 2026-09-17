/**
 * warehouse-onboarding.ts
 *
 * Pure validation for POST /api/admin/warehouses (Pass 3, Part A: مذخر
 * onboarding). A `Warehouse` row with no linked `User` is useless, so a
 * SUPER_ADMIN onboarding request always carries both a warehouse half and an
 * owner-account half — this validates and normalises both in one pass, with
 * Arabic error messages ready to surface directly to the control-tower UI.
 *
 * Deliberately has no Prisma import, no `next/headers`, and no `auth()` call
 * so it can be unit-tested without spinning up the Next.js runtime — mirrors
 * app/lib/warehouse-access.ts. The route handler does all I/O (the
 * email-uniqueness check, the warehouse-code-uniqueness check, the
 * transaction); this module only shapes and validates the input.
 *
 * NOTE: the returned `value` never carries a `branchId` — a WAREHOUSE user
 * must never have one (that is what keeps tenant isolation intact), and
 * since this shape has no `branchId` field to begin with, no caller-supplied
 * `branchId` in the raw input can ever reach the create call through here.
 */

export interface WarehouseOnboardingInput {
    warehouse?: {
        name?: unknown;
        code?: unknown;
        phone?: unknown;
        address?: unknown;
        city?: unknown;
        contactPerson?: unknown;
        email?: unknown;
    };
    owner?: {
        email?: unknown;
        password?: unknown;
        name?: unknown;
    };
}

export interface ValidatedWarehouseOnboarding {
    warehouse: {
        name: string;
        code?: string;
        phone?: string;
        address?: string;
        city?: string;
        contactPerson?: string;
        email?: string;
    };
    owner: {
        email: string;
        password: string;
        name?: string;
    };
}

export type WarehouseOnboardingResult =
    | { ok: true; value: ValidatedWarehouseOnboarding }
    | { ok: false; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trims a possibly-missing/non-string field down to `undefined` when blank. */
function optionalString(v: unknown): string | undefined {
    if (typeof v !== 'string') return undefined;
    const trimmed = v.trim();
    return trimmed === '' ? undefined : trimmed;
}

/**
 * validateWarehouseFields
 *
 * Shared rules for the subset of Warehouse columns that are both settable at
 * onboarding time (validateWarehouseOnboarding, below) and later editable via
 * PATCH /api/admin/warehouses/[id] (Task 4 of the admin مذاخر surface):
 * `name` (required, non-blank) plus `phone` / `city` / `contactPerson` /
 * `address` (all optional, blank normalises to `undefined`).
 *
 * Deliberately excludes `code` and `email` — `code` carries its own
 * cross-warehouse uniqueness check that only the onboarding route performs,
 * and `email` is the vestigial Warehouse.email column the onboarding form
 * never actually surfaces (not the owner's login email, which lives on
 * User.email and is out of scope for editing here). Neither is part of the
 * Task 4 edit surface.
 */
export interface WarehouseFieldsInput {
    name?: unknown;
    phone?: unknown;
    address?: unknown;
    city?: unknown;
    contactPerson?: unknown;
}

export interface ValidatedWarehouseFields {
    name: string;
    phone?: string;
    address?: string;
    city?: string;
    contactPerson?: string;
}

export type WarehouseFieldsResult =
    | { ok: true; value: ValidatedWarehouseFields }
    | { ok: false; errors: string[] };

export function validateWarehouseFields(input: WarehouseFieldsInput): WarehouseFieldsResult {
    const errors: string[] = [];
    const raw = input ?? {};

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) errors.push('اسم المذخر مطلوب');

    const phone = optionalString(raw.phone);
    const address = optionalString(raw.address);
    const city = optionalString(raw.city);
    const contactPerson = optionalString(raw.contactPerson);

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            name,
            ...(phone !== undefined && { phone }),
            ...(address !== undefined && { address }),
            ...(city !== undefined && { city }),
            ...(contactPerson !== undefined && { contactPerson }),
        },
    };
}

/**
 * validatePasswordReset
 *
 * Pure rule for POST /api/admin/warehouses/[id]/reset-password (Task 2):
 * the only rule is the same minimum length auth.ts enforces at login
 * (z.string().min(6)), surfaced here as an Arabic message.
 */
export interface PasswordResetInput {
    password?: unknown;
}

export type PasswordResetResult =
    | { ok: true; value: { password: string } }
    | { ok: false; errors: string[] };

export function validatePasswordReset(input: PasswordResetInput): PasswordResetResult {
    const password = typeof input?.password === 'string' ? input.password : '';
    if (password.length < 6) {
        return { ok: false, errors: ['كلمة المرور يجب أن تكون 6 أحرف على الأقل'] };
    }
    return { ok: true, value: { password } };
}

export function validateWarehouseOnboarding(input: WarehouseOnboardingInput): WarehouseOnboardingResult {
    const errors: string[] = [];
    const rawWarehouse = input?.warehouse ?? {};
    const rawOwner = input?.owner ?? {};

    // ---- Warehouse core fields (name required; phone/address/city/contactPerson optional) ----
    const fieldsResult = validateWarehouseFields(rawWarehouse);
    if (!fieldsResult.ok) {
        errors.push(...fieldsResult.errors);
    }

    // ---- Warehouse fields that only onboarding sets (not part of Task 4's edit surface) ----
    const code = optionalString(rawWarehouse.code);
    const warehouseEmail = optionalString(rawWarehouse.email);

    // ---- Owner.email (required, valid, normalised to lower-case) ----
    const ownerEmailRaw = typeof rawOwner.email === 'string' ? rawOwner.email.trim() : '';
    let ownerEmail = '';
    if (!ownerEmailRaw) {
        errors.push('البريد الإلكتروني لحساب المذخر مطلوب');
    } else if (!EMAIL_RE.test(ownerEmailRaw)) {
        errors.push('البريد الإلكتروني غير صالح');
    } else {
        ownerEmail = ownerEmailRaw.toLowerCase();
    }

    // ---- Owner.password (required, min 6 — same rule as auth.ts) ----
    const ownerPassword = typeof rawOwner.password === 'string' ? rawOwner.password : '';
    if (ownerPassword.length < 6) {
        errors.push('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    }

    // ---- Owner.name ----
    // لا يوجد حقل منفصل «اسم المالك» في النموذج: مالك المذخر هو نفسه الشخص
    // المسؤول، فيُشتق الاسم من contactPerson ثم من اسم المذخر كملاذ أخير.
    // owner.name يبقى مقبولاً في الـ API لمن يرسله صراحةً (توافق للخلف).
    // (يُقرأ rawWarehouse مباشرة هنا بدل fieldsResult.value لأن الأخير غير
    // متاح حين تفشل validateWarehouseFields، وهذا الاشتقاق مجرد قراءة نص خام
    // — لا يكرر قاعدة التحقق نفسها، تلك تبقى فقط داخل validateWarehouseFields.)
    const rawContactPerson = optionalString(rawWarehouse.contactPerson);
    const rawName = typeof rawWarehouse.name === 'string' ? rawWarehouse.name.trim() : '';
    const ownerName = optionalString(rawOwner.name) ?? rawContactPerson ?? (rawName || undefined);

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    // fieldsResult.ok must be true here — otherwise errors.length > 0 above
    // would already have returned. This re-check only narrows the type for
    // TypeScript without an `as` cast; it is unreachable in practice.
    if (!fieldsResult.ok) {
        return { ok: false, errors: fieldsResult.errors };
    }

    return {
        ok: true,
        value: {
            warehouse: {
                ...fieldsResult.value,
                ...(code !== undefined && { code }),
                ...(warehouseEmail !== undefined && { email: warehouseEmail }),
            },
            owner: {
                email: ownerEmail,
                password: ownerPassword,
                ...(ownerName !== undefined && { name: ownerName }),
            },
        },
    };
}
