"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { Button } from "@faramace/ui";
import { ArrowRight } from "lucide-react";
import { SubmitButton } from "@/app/ui/submit-button";
import { updateUser } from "@/app/lib/actions/user";

interface EditUserFormProps {
    user: any;
    branches: any[];
}

export default function EditUserForm({ user, branches }: EditUserFormProps) {
    const initialState = { message: null, errors: {} };
    const updateUserWithId = updateUser.bind(null, user.id);
    const [state, dispatch] = useFormState(updateUserWithId, initialState as any);

    return (
        <form action={dispatch} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                        الاسم
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        defaultValue={user.name || ""}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        placeholder="أدخل اسم المستخدم"
                    />
                    {state.errors?.name && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.name}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        البريد الإلكتروني
                    </label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        defaultValue={user.email}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        placeholder="example@email.com"
                        dir="ltr"
                    />
                    {state.errors?.email && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.email}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                        كلمة المرور الجديدة (اتركها فارغة إذا لم ترغب بتغييرها)
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        minLength={6}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all"
                        placeholder="أدخل كلمة المرور الجديدة"
                        dir="ltr"
                    />
                    {state.errors?.password && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.password}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="role" className="block text-sm font-medium text-foreground mb-2">
                        الدور
                    </label>
                    <select
                        id="role"
                        name="role"
                        required
                        defaultValue={user.role}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all bg-card"
                    >
                        <option value="PHARMACIST">صيدلي</option>
                        <option value="CASHIER">كاشير</option>
                        <option value="ADMIN">مدير</option>
                    </select>
                    {state.errors?.role && (
                        <p className="mt-1 text-sm text-destructive">{state.errors.role}</p>
                    )}
                </div>

                <div className="md:col-span-2">
                    <label htmlFor="branchId" className="block text-sm font-medium text-foreground mb-2">
                        الفرع (اختياري)
                    </label>
                    <select
                        id="branchId"
                        name="branchId"
                        defaultValue={user.branchId || ""}
                        className="w-full rounded-lg border border-border bg-background px-4 py-2 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 outline-none transition-all bg-card"
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

            {state.message && (
                <p className="text-sm text-destructive">{state.message}</p>
            )}

            <div className="flex justify-end gap-4 pt-4 border-t border-border">
                <Button asChild variant="outline">
                    <Link href="/dashboard/users">إلغاء</Link>
                </Button>
                <SubmitButton text="حفظ التعديلات" icon={ArrowRight} />
            </div>
        </form>
    );
}
