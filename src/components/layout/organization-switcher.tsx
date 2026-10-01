"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { switchOrganizationAction } from "@/app/(app)/actions";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

interface Props {
  current: { organizationId: string; organizationName: string; role: Role };
  memberships: { organizationId: string; organizationName: string; role: Role }[];
}

/** Nom de l'entreprise active ; liste déroulante si l'utilisateur en a plusieurs. */
export function OrganizationSwitcher({ current, memberships }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (memberships.length < 2) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{current.organizationName}</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[current.role]}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label htmlFor="org-switcher" className="sr-only">
        Entreprise active
      </label>
      <select
        id="org-switcher"
        value={current.organizationId}
        disabled={pending}
        onChange={(e) => {
          const organizationId = e.target.value;
          setError(null);
          startTransition(async () => {
            const res = await switchOrganizationAction({ organizationId });
            if (!res.ok) setError(res.error.message);
            router.refresh();
          });
        }}
        className="w-full truncate rounded-md border border-input bg-background py-1.5 pr-8 pl-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
      >
        {memberships.map((m) => (
          <option key={m.organizationId} value={m.organizationId}>
            {m.organizationName}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">{ROLE_LABELS[current.role]}</p>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
