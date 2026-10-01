import { redirect } from "next/navigation";

// Seule section disponible pour l'instant ; les autres (Entreprise, Numérotation, PDF,
// Utilisateurs, IA, Abonnement, Sécurité) arrivent avec leurs phases.
export default function SettingsPage() {
  redirect("/settings/taxes");
}
