import type { Metadata } from "next";
import Link from "next/link";
import { H2, Legal, LegalDocument, P, UL } from "@/components/legal/legal-ui";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function ConfidentialitePage() {
  return (
    <LegalDocument title="Politique de confidentialité">
      <P>
        Cette page explique quelles données personnelles FacturDZ AI traite, pourquoi, avec qui
        elles sont partagées et comment exercer vos droits. Responsable du traitement pour les
        données des comptes : <Legal k="publisherName" /> (<Legal k="contactEmail" />
        ).
      </P>

      <H2>1. Données traitées</H2>
      <UL>
        <li>
          <strong>Compte</strong> : nom, prénom, adresse e-mail, téléphone (facultatif), mot de
          passe (conservé uniquement sous forme hachée, jamais en clair).
        </li>
        <li>
          <strong>Connexion et sécurité</strong> : sessions (7 jours), adresse IP et navigateur
          associés aux sessions et au journal d&apos;activité des actions importantes (émission,
          annulation, paiement, paramètres, administration).
        </li>
        <li>
          <strong>Entreprise</strong> : nom, coordonnées, NIF, NIS, RC, article d&apos;imposition,
          RIB et autres informations que vous renseignez pour vos factures.
        </li>
        <li>
          <strong>Données de vos clients</strong> que vous saisissez (noms, adresses, identifiants
          fiscaux, contacts), vos produits, devis, factures et paiements. Pour ces données, vous
          êtes responsable du traitement et l&apos;éditeur agit pour votre compte (sous-traitant).
        </li>
        <li>
          <strong>Assistant IA</strong> : compteurs d&apos;usage (nombre d&apos;appels, jetons, coût
          estimé, durée). Le texte de vos demandes n&apos;est pas conservé dans les journaux ; les
          propositions en attente sont conservées 24 heures.
        </li>
      </UL>

      <H2>2. Finalités</H2>
      <UL>
        <li>
          Fournir le service (création de compte, facturation, PDF, tableau de bord) — nécessité
          contractuelle.
        </li>
        <li>
          Sécuriser les comptes et prévenir les abus (limitation du débit, journal d&apos;activité,
          détection de fraude).
        </li>
        <li>
          Envoyer des e-mails de service : confirmation d&apos;adresse, réinitialisation de mot de
          passe, alerte de changement de mot de passe. Aucun e-mail commercial n&apos;est envoyé
          sans votre accord.
        </li>
        <li>Suivre la consommation et les plafonds du plan.</li>
      </UL>

      <H2>3. Destinataires et prestataires</H2>
      <UL>
        <li>
          <strong>Hébergeur</strong> (application et base de données) : <Legal k="host" />.
        </li>
        <li>
          <strong>Prestataire d&apos;e-mails transactionnels</strong> : Resend, qui reçoit
          l&apos;adresse du destinataire et le contenu du message pour l&apos;envoyer.
        </li>
        <li>
          <strong>Prestataire d&apos;intelligence artificielle</strong> (OpenAI ou Google Gemini,
          selon la configuration) : reçoit le texte que vous saisissez dans l&apos;assistant et,
          pour une question sur votre activité, les chiffres nécessaires à la réponse (pouvant
          inclure noms de clients et montants). Ces données ne sont envoyées que lorsque vous
          utilisez l&apos;assistant. Les conditions de conservation et d&apos;entraînement sont
          celles du prestataire : à vérifier et à documenter avant le lancement.
        </li>
        <li>
          Aucune donnée n&apos;est vendue. Il n&apos;y a pas de publicité ni de traceur
          d&apos;analyse d&apos;audience sur le site.
        </li>
      </UL>
      <P>
        Ces prestataires peuvent être situés hors d&apos;Algérie : les transferts de données et
        leurs garanties doivent être vérifiés par un juriste au regard de la réglementation
        algérienne applicable.
      </P>

      <H2>4. Cookies</H2>
      <P>
        L&apos;application utilise uniquement un cookie de session strictement nécessaire à la
        connexion (httpOnly, SameSite=Lax, sécurisé en HTTPS). Aucun cookie publicitaire ni
        d&apos;analyse n&apos;est déposé.
      </P>

      <H2>5. Durées de conservation</H2>
      <UL>
        <li>
          Sessions : 7 jours, supprimées à la déconnexion ou à la réinitialisation du mot de passe.
        </li>
        <li>
          Journal d&apos;activité et factures émises : conservés pendant la durée requise par la
          réglementation comptable applicable (durée à confirmer par un professionnel) ; les
          factures émises ne sont jamais purgées automatiquement.
        </li>
        <li>
          Compte et données d&apos;une entreprise : jusqu&apos;à la suppression demandée, sous
          réserve des obligations de conservation.
        </li>
      </UL>

      <H2>6. Sécurité</H2>
      <P>
        Cloisonnement strict des données par entreprise, contrôle des droits à chaque requête, mots
        de passe hachés, secrets conservés côté serveur, connexion HTTPS, limitation du débit,
        politique de sécurité de contenu, journal d&apos;activité et sauvegardes de la base de
        données. Aucune mesure ne garantit un risque nul ; en cas d&apos;incident affectant vos
        données, vous serez informé dans les conditions prévues par la réglementation.
      </P>

      <H2>7. Vos droits</H2>
      <P>
        Vous pouvez demander l&apos;accès à vos données, leur rectification, leur suppression ou
        vous opposer à un traitement, dans les conditions prévues par la législation algérienne
        applicable à la protection des données personnelles (la loi n° 18-07 est la référence
        habituelle : à confirmer par votre juriste, ainsi que les démarches éventuelles auprès de
        l&apos;autorité nationale compétente). Écrivez à <Legal k="contactEmail" /> depuis
        l&apos;adresse du compte ; une vérification d&apos;identité peut être demandée.
        Aujourd&apos;hui, ces demandes sont traitées manuellement : le service ne propose pas encore
        de suppression de compte en libre-service.
      </P>
      <P>
        Si vous êtes le client d&apos;une entreprise qui utilise FacturDZ AI, adressez d&apos;abord
        votre demande à cette entreprise, responsable de vos données.
      </P>

      <H2>8. Modifications</H2>
      <P>
        Cette politique peut évoluer ; la version en vigueur est celle de cette page. Voir aussi les{" "}
        <Link
          href="/mentions-legales"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          mentions légales
        </Link>{" "}
        et les{" "}
        <Link href="/cgu" className="text-primary underline underline-offset-4 hover:no-underline">
          conditions générales
        </Link>
        .
      </P>
    </LegalDocument>
  );
}
