"use server";

import { revalidatePath } from "next/cache";
import type { ProductInput, TaxRateInput } from "@/lib/validation/product";
import { safeAction } from "@/server/errors";
import {
  createProduct,
  deleteProduct,
  setProductActive,
  updateProduct,
} from "@/server/services/products";
import { createTaxRate, setTaxRateActive, updateTaxRate } from "@/server/services/tax-rates";
import { requireTenant } from "@/server/tenant/context";

// Produits : chaque action revérifie session, entreprise et permission.

export async function createProductAction(input: ProductInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("products:write");
    const product = await createProduct(ctx, input);
    revalidatePath("/products");
    return { id: product.id };
  });
}

export async function updateProductAction(id: string, input: ProductInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("products:write");
    const product = await updateProduct(ctx, id, input);
    revalidatePath("/products");
    revalidatePath(`/products/${product.id}`);
    return { id: product.id };
  });
}

export async function setProductActiveAction(id: string, active: boolean) {
  return safeAction(async () => {
    const ctx = await requireTenant("products:write");
    await setProductActive(ctx, id, active === true);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
  });
}

export async function deleteProductAction(id: string) {
  return safeAction(async () => {
    const ctx = await requireTenant("products:delete");
    await deleteProduct(ctx, id);
    revalidatePath("/products");
  });
}

// Taux de TVA (paramètres de l'entreprise).

export async function createTaxRateAction(input: TaxRateInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("settings:manage");
    await createTaxRate(ctx, input);
    revalidatePath("/settings/taxes");
  });
}

export async function updateTaxRateAction(id: string, input: TaxRateInput) {
  return safeAction(async () => {
    const ctx = await requireTenant("settings:manage");
    await updateTaxRate(ctx, id, input);
    revalidatePath("/settings/taxes");
  });
}

export async function setTaxRateActiveAction(id: string, active: boolean) {
  return safeAction(async () => {
    const ctx = await requireTenant("settings:manage");
    await setTaxRateActive(ctx, id, active === true);
    revalidatePath("/settings/taxes");
  });
}
