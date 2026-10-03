/**
 * Informations juridiques de l'éditeur. UNE SEULE source pour les trois pages légales.
 * Chaque valeur `null` s'affiche sur le site comme « [À COMPLÉTER : …] » (visible, volontairement) :
 * `pnpm legal:check` liste ce qui manque. Ces valeurs relèvent de l'éditeur (vous), pas du code :
 * ne rien inventer, les reprendre de vos documents officiels (registre du commerce, statuts).
 */
export const LEGAL_DRAFT_DATE = "4 octobre 2026";

export const LEGAL = {
  /** Raison sociale ou nom de l'exploitant. */
  publisherName: null as string | null,
  /** Forme juridique (SARL, EURL, entreprise individuelle…). */
  legalForm: null as string | null,
  /** Adresse du siège. */
  address: null as string | null,
  /** Numéro d'immatriculation au registre du commerce. */
  rc: null as string | null,
  /** Numéro d'identification fiscale. */
  nif: null as string | null,
  /** Responsable de la publication. */
  publicationDirector: null as string | null,
  /** E-mail de contact (support, exercice des droits sur les données). */
  contactEmail: null as string | null,
  /** Téléphone (facultatif). */
  phone: null as string | null,
  /** Hébergeur de l'application et de la base de données (nom, adresse, pays). */
  host: null as string | null,
  /** Tribunal compétent / juridiction. */
  jurisdiction: null as string | null,
};

export type LegalKey = keyof typeof LEGAL;

export const LEGAL_LABELS: Record<LegalKey, string> = {
  publisherName: "raison sociale ou nom de l'exploitant",
  legalForm: "forme juridique",
  address: "adresse du siège",
  rc: "numéro de registre du commerce",
  nif: "numéro d'identification fiscale (NIF)",
  publicationDirector: "responsable de la publication",
  contactEmail: "e-mail de contact",
  phone: "téléphone",
  host: "hébergeur (nom, adresse, pays)",
  jurisdiction: "juridiction compétente",
};

/** Champs facultatifs : leur absence n'empêche pas le lancement. */
export const OPTIONAL_LEGAL_KEYS: LegalKey[] = ["phone"];

export function missingLegalFields(source: Record<LegalKey, string | null> = LEGAL): LegalKey[] {
  return (Object.keys(LEGAL_LABELS) as LegalKey[]).filter(
    (k) => !OPTIONAL_LEGAL_KEYS.includes(k) && !source[k]?.trim(),
  );
}
