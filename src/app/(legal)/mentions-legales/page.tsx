import type { Metadata } from "next";
import Link from "next/link";
import { H2, Legal, P, UL } from "@/components/legal/legal-ui";

export const metadata: Metadata = { title: "Mentions légales" };

export default function MentionsLegalesPage() {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight">Mentions légales</h1>

      <H2>Éditeur du service</H2>
      <UL>
        <li>
          Dénomination : <Legal k="publisherName" />
        </li>
        <li>
          Forme juridique : <Legal k="legalForm" />
        </li>
        <li>
          Siège : <Legal k="address" />
        </li>
        <li>
          Registre du commerce : <Legal k="rc" />
        </li>
        <li>
          NIF : <Legal k="nif" />
        </li>
        <li>
          Responsable de la publication : <Legal k="publicationDirector" />
        </li>
        <li>
          Contact : <Legal k="contactEmail" /> {/* téléphone facultatif */}
          <Legal k="phone" />
        </li>
      </UL>

      <H2>Hébergement</H2>
      <P>
        L&apos;application et ses données sont hébergées par : <Legal k="host" />.
      </P>

      <H2>Propriété intellectuelle</H2>
      <P>
        L&apos;application FacturDZ AI, son code, son interface, ses textes et ses marques sont la
        propriété de l&apos;éditeur ou de ses concédants. Toute reproduction ou réutilisation sans
        autorisation écrite est interdite. Les données saisies par les utilisateurs (clients,
        produits, factures…) restent leur propriété.
      </P>

      <H2>Responsabilité</H2>
      <P>
        FacturDZ AI est un outil de gestion. Il ne fournit ni conseil comptable, fiscal ou juridique
        : l&apos;utilisateur reste responsable de l&apos;exactitude de ses documents, des taux de
        TVA paramétrés et des mentions obligatoires qu&apos;il saisit. Les conditions détaillées
        figurent dans les{" "}
        <Link href="/cgu" className="text-primary underline-offset-4 hover:underline">
          conditions générales d&apos;utilisation
        </Link>
        .
      </P>

      <H2>Données personnelles</H2>
      <P>
        Le traitement des données personnelles est décrit dans la{" "}
        <Link href="/confidentialite" className="text-primary underline-offset-4 hover:underline">
          politique de confidentialité
        </Link>
        . Pour toute demande : <Legal k="contactEmail" />.
      </P>

      <H2>Droit applicable</H2>
      <P>
        Le service est régi par le droit algérien. Juridiction compétente :{" "}
        <Legal k="jurisdiction" />.
      </P>
    </article>
  );
}
