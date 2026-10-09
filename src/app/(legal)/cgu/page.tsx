import type { Metadata } from "next";
import Link from "next/link";
import { H2, Legal, P, UL } from "@/components/legal/legal-ui";

export const metadata: Metadata = { title: "Conditions générales d'utilisation" };

export default function CguPage() {
  return (
    <article>
      <h1 className="text-3xl font-semibold tracking-tight">
        Conditions générales d&apos;utilisation
      </h1>

      <H2>1. Objet</H2>
      <P>
        Les présentes conditions encadrent l&apos;utilisation de FacturDZ AI, service en ligne de
        facturation, de devis, de suivi des paiements et d&apos;assistance par intelligence
        artificielle, édité par <Legal k="publisherName" /> (« l&apos;éditeur »). En créant un
        compte, l&apos;utilisateur déclare les avoir lues et acceptées.
      </P>

      <H2>2. Compte et accès</H2>
      <UL>
        <li>
          L&apos;inscription exige une adresse e-mail valide, confirmée par un lien envoyé à cette
          adresse.
        </li>
        <li>
          L&apos;utilisateur choisit un mot de passe d&apos;au moins 10 caractères et le garde
          confidentiel ; il est responsable de l&apos;activité réalisée avec son compte.
        </li>
        <li>
          Un compte peut appartenir à plusieurs entreprises ; le propriétaire d&apos;une entreprise
          gère ses membres et leurs rôles.
        </li>
        <li>
          L&apos;éditeur peut suspendre un compte en cas d&apos;usage frauduleux, abusif ou
          contraire aux présentes.
        </li>
      </UL>

      <H2>3. Description du service</H2>
      <P>
        Le service permet de gérer clients et produits, d&apos;établir des devis et des factures
        (numérotation continue par entreprise, calcul des montants par le serveur),
        d&apos;enregistrer des paiements, de générer des documents PDF, de consulter un tableau de
        bord et d&apos;utiliser un assistant. Il n&apos;offre pas de paiement en ligne : les
        paiements sont enregistrés par l&apos;utilisateur. L&apos;interface et les PDF sont en
        français.
      </P>

      <H2>4. Responsabilité de l&apos;utilisateur sur ses documents</H2>
      <UL>
        <li>
          L&apos;utilisateur reste seul responsable du contenu de ses factures et devis, des taux de
          TVA qu&apos;il paramètre, des mentions légales (NIF, NIS, RC, article d&apos;imposition…)
          et du respect de ses obligations comptables et fiscales.
        </li>
        <li>
          FacturDZ AI ne fournit aucun conseil comptable, fiscal ou juridique. Il est recommandé de
          faire valider ses paramètres et ses modèles de documents par un professionnel.
        </li>
        <li>
          Une facture émise est verrouillée et ne se supprime pas ; elle peut être annulée, et son
          numéro n&apos;est jamais réutilisé.
        </li>
        <li>
          L&apos;utilisateur est responsable des données personnelles de ses propres clients
          qu&apos;il saisit ; l&apos;éditeur les traite pour son compte, aux seules fins du service.
        </li>
      </UL>

      <H2>5. Assistant FacturDZ AI</H2>
      <UL>
        <li>
          L&apos;assistant propose, l&apos;utilisateur décide : aucune facture ou devis n&apos;est
          créé sans confirmation explicite, le document créé reste un brouillon, et l&apos;émission
          est une action humaine distincte.
        </li>
        <li>
          Les montants sont toujours recalculés par le serveur ; l&apos;intelligence artificielle ne
          calcule rien. Les propositions peuvent néanmoins comporter des erreurs (client, lignes,
          quantités) : l&apos;utilisateur doit les vérifier avant de confirmer.
        </li>
        <li>
          Le texte saisi et, pour les questions sur l&apos;activité, les chiffres nécessaires à la
          réponse sont transmis à un prestataire d&apos;intelligence artificielle tiers (voir la{" "}
          <Link
            href="/confidentialite"
            className="text-primary underline underline-offset-4 hover:no-underline"
          >
            politique de confidentialité
          </Link>
          ). Il ne faut pas y saisir d&apos;informations qui ne doivent pas quitter
          l&apos;entreprise.
        </li>
        <li>L&apos;usage de l&apos;assistant est plafonné selon le plan.</li>
      </UL>

      <H2>6. Plans, limites et tarifs</H2>
      <P>
        Chaque entreprise est rattachée à un plan comportant des plafonds mensuels (factures, devis,
        requêtes d&apos;intelligence artificielle). Ces plafonds, ainsi que les tarifs en vigueur,
        sont indiqués sur le site et peuvent évoluer ; toute modification de prix applicable à un
        abonnement en cours est notifiée à l&apos;avance. Si l&apos;abonnement est résilié,
        l&apos;émission de factures, la création de devis et l&apos;assistant sont désactivés ; la
        consultation, les PDF et l&apos;enregistrement des paiements restent disponibles.
      </P>

      <H2>7. Usages interdits</H2>
      <UL>
        <li>
          Tenter d&apos;accéder aux données d&apos;une autre entreprise ou de contourner les limites
          et mesures de sécurité.
        </li>
        <li>
          Émettre des documents frauduleux ou fictifs présentés comme réels, ou utiliser le service
          à des fins illégales.
        </li>
        <li>
          Surcharger le service (requêtes automatisées abusives) ou en extraire les données de
          manière massive.
        </li>
      </UL>

      <H2>8. Disponibilité</H2>
      <P>
        L&apos;éditeur s&apos;efforce d&apos;assurer la disponibilité du service sans garantir
        l&apos;absence d&apos;interruption (maintenance, incident, dépendance à des prestataires
        tiers). Aucun engagement de niveau de service n&apos;est pris sauf stipulation écrite
        contraire.
      </P>

      <H2>9. Limitation de responsabilité</H2>
      <P>
        Dans les limites autorisées par la loi, l&apos;éditeur n&apos;est pas responsable des
        conséquences d&apos;une saisie erronée, d&apos;un paramétrage fiscal inexact ou d&apos;un
        usage non conforme du service, ni des dommages indirects. Sa responsabilité,
        lorsqu&apos;elle est engagée, est limitée au montant payé par l&apos;utilisateur sur les 12
        derniers mois. Cette clause est à valider juridiquement.
      </P>

      <H2>10. Résiliation et données</H2>
      <P>
        L&apos;utilisateur peut cesser d&apos;utiliser le service à tout moment. La suppression
        d&apos;un compte ou d&apos;une entreprise et la restitution des données s&apos;effectuent
        sur demande à <Legal k="contactEmail" />. Les factures émises sont conservées pendant la
        durée requise par la réglementation comptable applicable (durée à confirmer par un
        professionnel).
      </P>

      <H2>11. Évolution des conditions</H2>
      <P>
        Les conditions peuvent évoluer ; la version en vigueur est celle publiée sur cette page. Les
        modifications substantielles sont portées à la connaissance des utilisateurs.
      </P>

      <H2>12. Droit applicable et litiges</H2>
      <P>
        Les présentes sont soumises au droit algérien. À défaut de règlement amiable, les litiges
        relèvent de : <Legal k="jurisdiction" />.
      </P>

      <H2>Contact</H2>
      <P>
        <Legal k="contactEmail" /> — voir aussi les{" "}
        <Link
          href="/mentions-legales"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          mentions légales
        </Link>
        .
      </P>
    </article>
  );
}
