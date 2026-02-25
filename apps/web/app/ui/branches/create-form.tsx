"use client";

import Link from "next/link";
import { Button } from "@faramace/ui";
import { useFormState } from "react-dom";
import { createBranch } from "@/app/lib/actions/branch";
import { SubmitButton } from "@/app/ui/submit-button";
import UpgradePrompt from "@/app/ui/upgrade-prompt";

interface Organization {
  id: string;
  name: string;
}

export default function Form({ organizations }: { organizations: Organization[] }) {
  const initialState: any = { message: "", errors: {} };
  const [state, dispatch] = useFormState(createBranch, initialState);

  return (
    <form action={dispatch}>
      <div className="rounded-md bg-muted p-4 md:p-6">
        <div className="mb-4">
          {/* Auto-select first organization and hide the selector */}
          {organizations.length > 0 && (
            <input type="hidden" name="organizationId" value={organizations[0].id} />
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="name" className="mb-2 block text-sm font-medium">
            اسم الفرع
          </label>
          <div className="relative mt-2 rounded-md">
            <input
              id="name"
              name="name"
              type="text"
              placeholder="أدخل اسم الفرع"
              className="peer block w-full rounded-md border border-border py-2 px-3 text-sm outline-2 placeholder:text-muted-foreground"
              aria-describedby="name-error"
            />
          </div>
          <div id="name-error" aria-live="polite" aria-atomic="true">
            {state.errors?.name &&
              state.errors.name.map((error: string) => (
                <p key={error} className="mt-2 text-sm text-destructive">
                  {error}
                </p>
              ))}
          </div>
        </div>
      </div>
      {/* Upgrade prompt shown when plan limit is reached */}
      {(state as any).limitReached && (
        <UpgradePrompt
          message={(state as any).message}
          current={(state as any).current}
          max={(state as any).max}
        />
      )}

      <div className="mt-6 flex justify-end gap-4">
        <Link
          href="/dashboard/branches"
          className="flex h-10 items-center rounded-lg bg-muted px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          إلغاء
        </Link>
        {!(state as any).limitReached && (
          <SubmitButton text="إنشاء الفرع" loadingText="جاري الإنشاء..." />
        )}
      </div>
    </form>
  );
}
