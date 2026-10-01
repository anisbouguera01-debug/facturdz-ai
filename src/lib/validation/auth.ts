import { z } from "zod";

/**
 * Schémas partagés client/serveur pour l'authentification.
 * Les limites de mot de passe doivent rester alignées sur src/server/auth/auth.ts.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const email = z
  .string()
  .trim()
  .min(1, "Saisissez votre adresse e-mail.")
  .pipe(z.email("Cette adresse e-mail n'est pas valide."))
  .transform((v) => v.toLowerCase());

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Saisissez votre mot de passe."),
});

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, "Saisissez votre prénom.").max(80),
  lastName: z.string().trim().min(1, "Saisissez votre nom.").max(80),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`)
    .max(PASSWORD_MAX, `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX} caractères.`),
});

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
