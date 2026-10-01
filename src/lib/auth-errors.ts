/** Traduit les erreurs du client Better Auth en messages utilisateur (sans fuite d'information). */
export function authErrorMessage(
  error: { status?: number; code?: string } | null | undefined,
  context: "login" | "register",
): string {
  const code = error?.code ?? "";
  if (error?.status === 429) {
    return "Trop de tentatives. Patientez une minute avant de réessayer.";
  }
  if (context === "register" && code.includes("ALREADY_EXISTS")) {
    return "Un compte existe déjà avec cette adresse. Connectez-vous ou utilisez une autre adresse.";
  }
  if (code.includes("PASSWORD_TOO_SHORT")) {
    return "Le mot de passe doit contenir au moins 10 caractères.";
  }
  if (context === "login") {
    // Même message pour e-mail inconnu, mauvais mot de passe ou compte suspendu.
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  return "Le compte n'a pas pu être créé. Vérifiez les informations saisies et réessayez.";
}
