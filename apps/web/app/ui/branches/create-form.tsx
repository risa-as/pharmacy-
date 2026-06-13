"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { createBranch } from "@/app/lib/actions/branch";
import { SubmitButton } from "@/app/ui/submit-button";
import UpgradePrompt from "@/app/ui/upgrade-prompt";
import { Store, ArrowRight, Building2 } from "lucide-react";

interface Organization {
  id: string;
  name: string;
}

export default function Form({ organizations }: { organizations: Organization[] }) {
  const initialState: any = { message: "", errors: {} };
  const [state, dispatch] = useFormState(createBranch, initialState);

  const multiOrg = organizations.length > 1;

  return (
    <form action={dispatch} className="space-y-6">
      {/* المنظمة — قائمة منسدلة عند تعدد المنظمات، وإلا حقل مخفي */}
      {multiOrg ? (
        <div>
          <label htmlFor="organizationId" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            المنظمة
          </label>
          <select
            id="organizationId"
            name="organizationId"
            defaultValue={organizations[0].id}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          {state.errors?.organizationId && (
            <p className="mt-1 text-sm text-destructive">{state.errors.organizationId}</p>
          )}
        </div>
      ) : (
        organizations.length > 0 && (
          <input type="hidden" name="organizationId" value={organizations[0].id} />
        )
      )}

      {/* اسم الفرع */}
      <div>
        <label htmlFor="name" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Store className="h-4 w-4 text-muted-foreground" />
          اسم الفرع
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="مثال: الفرع الرئيسي"
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          aria-describedby="name-error"
          required
        />
        <div id="name-error" aria-live="polite" aria-atomic="true">
          {state.errors?.name &&
            state.errors.name.map((error: string) => (
              <p key={error} className="mt-1 text-sm text-destructive">
                {error}
              </p>
            ))}
        </div>
      </div>

      {/* رسالة الخطأ العامة */}
      {state.message && !(state as any).limitReached && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {state.message}
        </div>
      )}

      {/* تنبيه الترقية عند الوصول لحد الخطة */}
      {(state as any).limitReached && (
        <UpgradePrompt
          message={(state as any).message}
          current={(state as any).current}
          max={(state as any).max}
        />
      )}

      {/* الأزرار */}
      <div className="flex justify-end gap-3 border-t border-border pt-6">
        <Link
          href="/dashboard/branches"
          className="flex items-center gap-2 rounded-lg bg-muted px-5 py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted/80"
        >
          <ArrowRight className="h-4 w-4" />
          إلغاء
        </Link>
        {!(state as any).limitReached && (
          <SubmitButton
            text="إنشاء الفرع"
            loadingText="جارٍ الإنشاء..."
            icon={Store}
            className="px-6 py-3 font-bold"
          />
        )}
      </div>
    </form>
  );
}
