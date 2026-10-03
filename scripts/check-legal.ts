/**
 * Liste les informations juridiques encore à renseigner dans src/lib/legal-config.ts.
 *   pnpm legal:check          (affiche) ; code 1 s'il en manque
 * À lancer avant la mise en production : un site public avec des « À COMPLÉTER » visibles
 * n'est pas prêt.
 */
import { LEGAL, LEGAL_LABELS, missingLegalFields } from "../src/lib/legal-config";

const missing = missingLegalFields(LEGAL);
if (missing.length === 0) {
  console.log(
    "✔ Informations juridiques complètes (la validation par un juriste reste nécessaire).",
  );
} else {
  console.error(
    `✘ ${missing.length} information(s) juridique(s) à renseigner dans src/lib/legal-config.ts :`,
  );
  for (const k of missing) console.error(`  - ${k} : ${LEGAL_LABELS[k]}`);
  process.exit(1);
}
