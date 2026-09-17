/**
 * warehouse-users.ts
 *
 * Pure decision/validation logic for the three end-of-B2B warehouse features
 * that touch User rows directly:
 *   - Feature 1: OWNER-managed STAFF accounts (app/api/warehouse-portal/users)
 *   - Feature 2: self-service password change (app/api/warehouse-portal/change-password)
 *   - Feature 3: admin login block via User.isActive
 *     (app/api/admin/warehouses/[id]/users/[userId])
 *
 * Deliberately has no Prisma import, no `next/headers`, and no `auth()` call
 * so it can be unit-tested without spinning up the Next.js runtime — mirrors
 * app/lib/warehouse-access.ts and app/lib/warehouse-onboarding.ts. All I/O
 * (session/DB lookups, bcrypt, the actual update) stays in the route
 * handlers; this module only decides and shapes.
 */

import { validatePasswordReset } from './warehouse-onboarding';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Feature 1: who may manage a مذخر's users ────────────────────────────────

/**
 * True only for the مذخر's OWNER. STAFF (and anything else — null,
 * undefined, an unrecognised string) must never manage users, including
 * themselves creating more STAFF or toggling anyone's isActive.
 *
 * `warehouseUserType` deliberately is NOT in the NextAuth session (see
 * warehouse-context.ts), so every route that calls this must look the actor
 * up from Prisma at request time rather than trust the JWT — a demotion (or
 * deactivation) then takes effect immediately instead of waiting for the
 * actor's session to expire/refresh.
 */
export function canManageWarehouseUsers(actor: { warehouseUserType?: string | null }): boolean {
    return actor?.warehouseUserType === 'OWNER';
}

// ── Feature 1 & 3: the last-active-OWNER lockout guard ──────────────────────

export interface DecideDeactivateUserInput {
    /** Whether the target user is (or was, if already inactive) an OWNER. */
    targetIsOwner: boolean;
    /** The target's isActive value BEFORE this change is applied. */
    targetIsActive: boolean;
    /**
     * Count of currently-active OWNERs in the target's مذخر, INCLUDING the
     * target itself if the target is currently an active OWNER. So "this is
     * the last active owner" is `activeOwnerCount === 1`, not `<= 0` — the
     * count query the caller runs is
     * `{ warehouseId, warehouseUserType: 'OWNER', isActive: true }`, which
     * naturally includes the target while its own row is still active.
     */
    activeOwnerCount: number;
}

export type DecideDeactivateUserResult = { ok: true } | { ok: false; error: string };

/**
 * Guards any change to User.isActive for a warehouse account (both Feature 1
 * — OWNER manages own مذخر — and Feature 3 — SUPER_ADMIN manages any مذخر —
 * share this same guard, mirroring the identical lockout risk).
 *
 * Callers only invoke this when the REQUESTED new value is `false`
 * (deactivating). No direction/"requested value" parameter is needed to also
 * cover reactivation: a user being reactivated is, by definition, currently
 * inactive (`targetIsActive === false`), and turning an already-inactive
 * account "off" again (or, equivalently, "on") can never remove the mذخر's
 * last active owner — there is nothing active to lose. So the
 * `targetIsActive === false` branch below transparently covers both
 * "re-deactivating an already-inactive account" and "the no-op/always-allowed
 * reactivation case" with the same line.
 *
 * The only blocked transition: an OWNER, currently active, who is the ONLY
 * currently-active OWNER of their مذخر (`activeOwnerCount === 1`) — without
 * this guard an owner could deactivate themselves (or another owner) and
 * permanently lock the whole مذخر out, since a deactivated account can never
 * log in again to reverse it (auth.ts rejects `isActive === false` before
 * even comparing the password hash — a reset password does not help either).
 */
export function decideDeactivateUser(input: DecideDeactivateUserInput): DecideDeactivateUserResult {
    const { targetIsOwner, targetIsActive, activeOwnerCount } = input;

    // Nothing active to lose: either already inactive, or this *is* the
    // reactivation case (target necessarily currently inactive).
    if (!targetIsActive) return { ok: true };

    // An active STAFF account never gates the مذخر's access as a whole.
    if (!targetIsOwner) return { ok: true };

    // Active OWNER, and another active OWNER remains after this one goes
    // inactive.
    if (activeOwnerCount > 1) return { ok: true };

    return {
        ok: false,
        error: 'لا يمكن إيقاف آخر مالك فعّال في هذا المذخر. يجب أن يبقى مالك واحد فعّال على الأقل، وإلا يفقد المذخر الوصول لحسابه بالكامل بلا رجعة.',
    };
}

// ── Phase 3 (الأدوار والصلاحيات): نفس حارس القفل، مطبَّقاً على تغيير الدور ──

/**
 * حارس القفل نفسه بالضبط الذي يحمي decideDeactivateUser أعلاه، مُطبَّقاً على
 * انتقال آخر: تغيير دور آخر مالك فعّال بعيداً عن OWNER مدمِّر بنفس القدر —
 * كلاهما يسحب من هذا المستخدم قدرته على إدارة المذخر (بما فيها إعادة ترقية
 * نفسه لاحقاً)، وإن كان هو آخر من يملكها فالمذخر بأكمله يفقد الوصول لإدارته
 * بلا رجعة (لا OWNER فعّال متبقٍ يستطيع التراجع عن القرار).
 *
 * "نفس فئة القفل" حرفياً وليس مجرد شبيهة: تُمرَّر نفس المدخلات الثلاثة تماماً
 * (targetIsOwner يعني هنا "الدور الحالي قبل هذا التغيير هو OWNER"،
 * targetIsActive حالة التفعيل الحالية، activeOwnerCount يشمل الهدف نفسه إن
 * كان فعّالاً) إلى decideDeactivateUser نفسها، فقط برسالة خطأ مختلفة الصياغة
 * تخص "تغيير دور" لا "إيقاف حساب". لا حاجة لمعامل "الدور الجديد المطلوب" هنا
 * أصلاً — الاستدعاء (route handler) هو من يقرر أصلاً استدعاء هذه الدالة فقط
 * حين يكون الانتقال المطلوب فعلاً "OWNER → أي شيء آخر غير OWNER"؛ فرع
 * "OWNER → OWNER" (لا تغيير فعلي) أو "غير OWNER → أي شيء" لا يستدعيانها
 * إطلاقاً، وبالتحديد لأن نفس النقطة تنطبق على "self" مقابل "owner آخر": حين
 * activeOwnerCount === 1 فالمالك الفعّال الوحيد هو بالضرورة صاحب الجلسة التي
 * تنفّذ هذا الطلب أصلاً (لا أحد آخر فعّال بدور OWNER موجود ليطلبه)، فتغطية
 * "لا يستطيع مستخدم تغيير دوره الخاص بعيداً عن OWNER إن كان آخر مالك فعّال"
 * تنبثق تلقائياً من هذا القفل العام بلا حاجة لفحص "هل الهدف = الفاعل؟" منفصل.
 */
export function decideOwnerRoleChange(input: DecideDeactivateUserInput): DecideDeactivateUserResult {
    const base = decideDeactivateUser(input);
    if (base.ok) return base;
    return {
        ok: false,
        error: 'لا يمكن تغيير دور آخر مالك فعّال في هذا المذخر بعيداً عن "مالك". يجب أن يبقى مالك واحد فعّال على الأقل، وإلا يفقد المذخر القدرة على إدارة نفسه بلا رجعة.',
    };
}

// ── Phase 3 (الأدوار والصلاحيات): الأدوار القابلة للإسناد ───────────────────

/**
 * الأدوار الخمسة الجديدة القابلة للإسناد فعلياً من واجهة/API إدارة المستخدمين
 * — لا تشمل STAFF عمداً (دور قديم/deprecated، انظر تعليق enum
 * WarehouseUserType في schema.prisma): حساب جديد لا يمكن إنشاؤه بدور STAFF
 * أبداً، وحساب STAFF قديم موجود لا يمكن "إعادته" إلى STAFF بعد تغييره —
 * فقط الانتقال بعيداً عنه ممكن.
 */
export const ASSIGNABLE_WAREHOUSE_USER_TYPES = ['OWNER', 'MANAGER', 'SALES', 'INVENTORY', 'ACCOUNTANT'] as const;
export type AssignableWarehouseUserType = (typeof ASSIGNABLE_WAREHOUSE_USER_TYPES)[number];

export type ValidateWarehouseUserTypeResult =
    | { ok: true; value: AssignableWarehouseUserType }
    | { ok: false; error: string };

/** يتحقق أن القيمة المُرسَلة (من جسم طلب) واحدة من الأدوار الخمسة القابلة للإسناد. */
export function validateWarehouseUserType(input: unknown): ValidateWarehouseUserTypeResult {
    if (typeof input !== 'string' || !(ASSIGNABLE_WAREHOUSE_USER_TYPES as readonly string[]).includes(input)) {
        return { ok: false, error: 'نوع المستخدم غير صالح — يجب أن يكون أحد: مالك، مدير، مندوب مبيعات، مسؤول مخزون، محاسب.' };
    }
    return { ok: true, value: input as AssignableWarehouseUserType };
}

// ── Feature 1: validating a new STAFF user's input ──────────────────────────

export interface StaffUserInput {
    email?: unknown;
    password?: unknown;
    name?: unknown;
}

export type StaffUserInputResult =
    | { ok: true; value: { email: string; password: string; name?: string } }
    | { ok: false; errors: string[] };

/**
 * Validates the two caller-supplied fields a STAFF account actually needs
 * (email + password). Reuses validatePasswordReset for the password-length
 * rule rather than duplicating auth.ts's z.string().min(6).
 *
 * Deliberately has no `role`/`branchId`/`warehouseId`/`warehouseUserType` in
 * StaffUserInput's shape at all — even if a request body smuggles those in,
 * this function structurally never reads or forwards them. The route handler
 * must still pass only the `value` this returns (plus a bcrypt hash and the
 * warehouseId from getWarehouseContext()) into buildStaffUserData below.
 */
export function validateStaffUserInput(input: StaffUserInput): StaffUserInputResult {
    const errors: string[] = [];

    const emailRaw = typeof input?.email === 'string' ? input.email.trim() : '';
    let email = '';
    if (!emailRaw) {
        errors.push('البريد الإلكتروني مطلوب');
    } else if (!EMAIL_RE.test(emailRaw)) {
        errors.push('البريد الإلكتروني غير صالح');
    } else {
        email = emailRaw.toLowerCase();
    }

    const passwordResult = validatePasswordReset({ password: input?.password });
    if (!passwordResult.ok) {
        errors.push(...passwordResult.errors);
    }

    const name = typeof input?.name === 'string' && input.name.trim() !== '' ? input.name.trim() : undefined;

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            email,
            password: passwordResult.ok ? passwordResult.value.password : '',
            ...(name !== undefined && { name }),
        },
    };
}

// ── Feature 1: shaping the actual create() payload ──────────────────────────

export interface BuildStaffUserDataInput {
    email: string;
    /** Already bcrypt-hashed — this module never hashes (impure). */
    hashedPassword: string;
    name?: string;
}

export interface StaffUserData {
    email: string;
    password: string;
    name?: string;
    role: 'WAREHOUSE';
    warehouseUserType: AssignableWarehouseUserType;
    branchId: null;
    warehouseId: string;
}

/**
 * Shapes the Prisma `user.create({ data })` payload for a new warehouse
 * account. `warehouseId` AND `warehouseUserType` are required POSITIONAL
 * arguments, never fields read off `input` — the caller must pass
 * `ctx.warehouseId` from getWarehouseContext() and an
 * `AssignableWarehouseUserType` already produced by
 * `validateWarehouseUserType()` above directly, so a request body's
 * `warehouseId`/`warehouseUserType`/`role` (if a caller tries to smuggle
 * those in via `input` typed loosely/`any` at the call site) are
 * structurally unreachable: this function has no code path that reads any of
 * them off `input` at all.
 *
 * Phase 3 (الأدوار والصلاحيات) generalised this from a STAFF-only helper (the
 * caller always passed the literal 'STAFF') to any of the five real roles —
 * see the regression test in warehouse-users.test.ts that passes a
 * maliciously-shaped `input` (extra `role`/`branchId`/`warehouseId`/
 * `warehouseUserType` fields alongside a legitimate, separately-passed
 * `warehouseUserType` argument) and asserts the output ignores every one of
 * `input`'s smuggled fields while still honouring the real
 * `warehouseUserType` argument.
 *
 * `role` and `branchId` stay hard-coded literals below, never taken from
 * `input` either — this is the privilege-escalation guard for Feature 1,
 * unchanged by this generalisation.
 */
export function buildStaffUserData(
    warehouseId: string,
    warehouseUserType: AssignableWarehouseUserType,
    input: BuildStaffUserDataInput
): StaffUserData {
    return {
        email: input.email,
        password: input.hashedPassword,
        ...(input.name !== undefined && { name: input.name }),
        role: 'WAREHOUSE',
        warehouseUserType,
        branchId: null,
        warehouseId,
    };
}

// ── Feature 2: self-service password change ─────────────────────────────────

export interface ChangePasswordInput {
    currentPassword?: unknown;
    newPassword?: unknown;
}

export type ChangePasswordResult =
    | { ok: true; value: { currentPassword: string; newPassword: string } }
    | { ok: false; errors: string[] };

/**
 * Pure shape/rule validation for POST /api/warehouse-portal/change-password.
 * Does NOT verify `currentPassword` against the stored hash — that requires
 * bcrypt.compare() against a DB row and stays in the route handler, which
 * MUST perform that check before calling prisma.user.update(). This function
 * only enforces: newPassword present & >= 6 chars (via validatePasswordReset,
 * not duplicated here), and newPassword !== currentPassword (both are the
 * caller-submitted plaintext values, so this is a plain string comparison —
 * no hashing needed for this particular rule).
 */
export function validatePasswordChange(input: ChangePasswordInput): ChangePasswordResult {
    const errors: string[] = [];

    const currentPassword = typeof input?.currentPassword === 'string' ? input.currentPassword : '';
    if (!currentPassword) {
        errors.push('كلمة المرور الحالية مطلوبة');
    }

    const newPassword = typeof input?.newPassword === 'string' ? input.newPassword : '';
    const lengthResult = validatePasswordReset({ password: newPassword });
    if (!lengthResult.ok) {
        errors.push(...lengthResult.errors);
    } else if (currentPassword && newPassword === currentPassword) {
        errors.push('كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية');
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, value: { currentPassword, newPassword } };
}
