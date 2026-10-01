"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/server/admin/context";
import {
  setAiPricing,
  setOrganizationSubscription,
  setPlanLimit,
  setUserStatus,
  updatePlan,
} from "@/server/admin/manage";
import { safeAction } from "@/server/errors";

// Administration : chaque action vérifie d'abord le rôle SUPER_ADMIN en base ; les services
// revalident toutes les entrées (Zod) et journalisent l'opération.

export async function setSubscriptionAction(input: {
  organizationId: string;
  planCode?: string;
  status?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
}) {
  return safeAction(async () => {
    const admin = await requireSuperAdmin();
    const res = await setOrganizationSubscription(admin, input);
    revalidatePath("/admin", "layout");
    return res;
  });
}

export async function updatePlanAction(input: {
  planId: string;
  name: string;
  priceMonthly: string;
  active: boolean;
}) {
  return safeAction(async () => {
    const admin = await requireSuperAdmin();
    await updatePlan(admin, input);
    revalidatePath("/admin", "layout");
  });
}

export async function setPlanLimitAction(input: {
  planId: string;
  key: Parameters<typeof setPlanLimit>[1]["key"];
  value: string | null;
}) {
  return safeAction(async () => {
    const admin = await requireSuperAdmin();
    await setPlanLimit(admin, input);
    revalidatePath("/admin", "layout");
  });
}

export async function setPricingAction(input: Parameters<typeof setAiPricing>[1]) {
  return safeAction(async () => {
    const admin = await requireSuperAdmin();
    await setAiPricing(admin, input);
    revalidatePath("/admin", "layout");
  });
}

export async function setUserStatusAction(input: {
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  return safeAction(async () => {
    const admin = await requireSuperAdmin();
    await setUserStatus(admin, input);
    revalidatePath("/admin", "layout");
  });
}
