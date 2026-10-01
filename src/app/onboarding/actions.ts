"use server";

import type { CreateOrganizationInput } from "@/lib/validation/organization";
import { requireSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { safeAction } from "@/server/errors";
import { createOrganization } from "@/server/services/organizations";
import { currentActor } from "@/server/tenant/context";

/** Crée l'entreprise de l'utilisateur connecté et l'active. */
export async function createOrganizationAction(input: CreateOrganizationInput) {
  return safeAction(
    async () => {
      await requireSession();
      const org = await createOrganization(getDb(), await currentActor(), input);
      return { id: org.id };
    },
    { action: "createOrganization" },
  );
}
