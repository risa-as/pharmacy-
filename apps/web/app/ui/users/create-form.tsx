"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { Button } from "@faramace/ui";
import { createUser } from "@/app/lib/actions/create-user-safe";
import { SubmitButton } from "@/app/ui/submit-button";

interface Branch {
    id: string;
    name: string;
}

export default function CreateUserForm({ branches }: { branches: Branch[] }) {
    const initialState: any = { message: "", errors: {} };
    const [state, dispatch] = useFormState(createUser, initialState);

    return (
        <form action={dispatch} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                {/* الاسم */}
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                        الاسم
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        className="w-full rounded-lg border border-border px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        placeholder="أدخل اسم المستخدم"
                    />
                    {state.errors?.name && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.name}</p>
                    )}
                </div>

                {/* البريد الإلكتروني */}
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        البريد الإلكتروني
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        className="w-full rounded-lg border border-border px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        placeholder="example@email.com"
                        dir="ltr"
                    />
                    {state.errors?.email && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.email}</p>
                    )}
                </div>

                {/* كلمة المرور */}
                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                        كلمة المرور
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        minLength={6}
                        className="w-full rounded-lg border border-border px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        placeholder="أدخل كلمة المرور"
                        dir="ltr"
                    />
                    {state.errors?.password && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.password}</p>
                    )}
                </div>

                {/* الدور */}
                <div>
                    <label htmlFor="role" className="block text-sm font-medium text-foreground mb-2">
                        الدور
                    </label>
                    <select
                        id="role"
                        name="role"
                        required
                        className="w-full rounded-lg border border-border px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all bg-card"
                    >
                        <option value="PHARMACIST">صيدلي</option>
                        <option value="CASHIER">كاشير</option>
                        <option value="ADMIN">مدير</option>
                    </select>
                    {state.errors?.role && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.role}</p>
                    )}
                </div>

                {/* الفرع */}
                <div className="md:col-span-2">
                    <label htmlFor="branchId" className="block text-sm font-medium text-foreground mb-2">
                        الفرع (اختياري)
                    </label>
                    <select
                        id="branchId"
                        name="branchId"
                        className="w-full rounded-lg border border-border px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all bg-card"
                    >
                        <option value="">-- بدون فرع --</option>
                        {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* رسالة الخطأ العامة */}
            {state.message && (
                <div className="rounded-lg bg-destructive/10 border border-red-200 p-4 text-sm text-destructive">
                    {state.message}
                </div>
            )}

            <div className="flex justify-end gap-4 pt-4 border-t border-border">
                <Button asChild variant="outline">
                    <Link href="/dashboard/users">إلغاء</Link>
                </Button>
                <SubmitButton
                    text="إنشاء المستخدم"
                    loadingText="جاري الإنشاء..."
                    className="bg-primary hover:bg-primary/90 text-white"
                />
            </div>
        </form>
    );
}
