import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";

/** Convertit NOT_FOUND d'un service en page 404 ; relance toute autre erreur. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
