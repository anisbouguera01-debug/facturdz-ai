"use server";

import { z } from "zod";
import { getDb } from "@/server/db/client";
import { safeAction } from "@/server/errors";
import { switchOrganization } from "@/server/services/organizations";
import { currentActor } from "@/server/tenant/context";

const switchSchema = z.object({ organizationId: z.string().min(1).max(64) });

/** Change l'organisation active (l'appartenance est vérifiée par le service). */
export async function switchOrganizationAction(input: { organizationId: string }) {
  return safeAction(
    async () => {
      const { organizationId } = switchSchema.parse(input);
      await switchOrganization(getDb(), await currentActor(), organizationId);
    },
    { action: "switchOrganization" },
  );
}
