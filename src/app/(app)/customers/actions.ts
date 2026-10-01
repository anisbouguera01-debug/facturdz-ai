"use server";

import { revalidatePath } from "next/cache";
import type { CustomerInput } from "@/lib/validation/customer";
import { safeAction } from "@/server/errors";
import {
  createCustomer,
  deleteCustomer,
  setCustomerArchived,
  updateCustomer,
} from "@/server/services/customers";
import { requireTenant } from "@/server/tenant/context";

/*
 * Server actions Clients. Chacune revérifie session, entreprise et permission
 * (requireTenant + contrôle dans le service) : elles sont appelables directement
 * par HTTP, sans passer par l'interface ni par le proxy.
 */

export async function createCustomerAction(input: CustomerInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("customers:write");
    const customer = await createCustomer(ctx, input);
    revalidatePath("/customers");
    return { id: customer.id };
  });
}

export async function updateCustomerAction(id: string, input: CustomerInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("customers:write");
    const customer = await updateCustomer(ctx, id, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${customer.id}`);
    return { id: customer.id };
  });
}

export async function setCustomerArchivedAction(id: string, archived: boolean) {
  return safeAction(async () => {
    const ctx = await requireTenant("customers:write");
    await setCustomerArchived(ctx, id, archived === true);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
  });
}

export async function deleteCustomerAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("customers:delete");
    await deleteCustomer(ctx, id);
    revalidatePath("/customers");
  });
}
