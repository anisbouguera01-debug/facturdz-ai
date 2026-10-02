import Image from "next/image";
import Link from "next/link";
import { InvoiceStub } from "@/components/layout/invoice-stub";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/server/plans-public";
import aiShot from "@/assets/landing/ai.png";
import dashboardShot from "@/assets/landing/dashboard.png";
import invoiceShot from "@/assets/landing/invoice.png";

/**
 * Sections de la page publique. Règle : on ne décrit que ce que l'application fait réellement,
 * sans statistique, témoignage, logo client ni promesse de conformité réglementaire.
 */

function Section({
  id,
  title,
  intro,
  children,
  tone,
}: {
  id: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  tone?: "paper";
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-16 py-16 sm:py-20", tone === "paper" && "bg-paper")}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        <h2
          id={`${id}-title`}
          className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
        >
          {title}
        </h2>
        {intro ? <p className="mt-3 max-w-2xl text-muted-foreground">{intro}</p> : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export function Header({ signedIn }: { signedIn: boolean }) {
  const links = [
    ["#fonctionnalites", "Fonctionnalités"],
    ["#ia", "FacturDZ AI"],
    ["#securite", "Sécurité"],
    ["#tarifs", "Tarifs"],
    ["#faq", "FAQ"],
  ];
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link href="/" className="font-semibold tracking-tight">
          FacturDZ <span className="text-primary">AI</span>
        </Link>
        <nav aria-label="Sections" className="hidden gap-6 text-sm md:flex">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
              Ouvrir l&apos;application
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex",
                )}
              >
                Se connecter
              </Link>
              <Link href="/register" className={buttonVariants({ size: "sm" })}>
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-paper">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-8 sm:py-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="text-sm font-medium tracking-wide text-primary uppercase">
            Pour les entreprises algériennes
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Facturez plus simplement avec FacturDZ AI.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Facturation, devis, paiements et intelligence artificielle dans une seule plateforme.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={signedIn ? "/dashboard" : "/register"}
              className={buttonVariants({ size: "lg" })}
            >
              {signedIn ? "Ouvrir l'application" : "Créer mon compte"}
            </Link>
            <a
              href="#fonctionnalites"
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Voir les fonctionnalités
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Interface en français · montants en dinars algériens (DA).
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <InvoiceStub />
        </div>
      </div>
    </section>
  );
}

const FEATURES: [string, string][] = [
  [
    "Factures et devis",
    "Créez des devis, convertissez-les en facture en un clic, gardez les brouillons modifiables jusqu'à l'émission.",
  ],
  [
    "Numérotation continue",
    "Le numéro est attribué à l'émission, par entreprise, sans trou ni doublon, même si plusieurs personnes émettent en même temps.",
  ],
  [
    "TVA et totaux fiables",
    "Tous les montants sont calculés par le serveur, en décimal exact. Les taux de TVA sont ceux que vous configurez pour votre entreprise.",
  ],
  [
    "Paiements",
    "Enregistrez les paiements partiels ou complets ; le statut de la facture et le reste à encaisser se mettent à jour. (Pas de paiement en ligne.)",
  ],
  [
    "Clients et produits",
    "Fichier clients (NIF, NIS, RC, wilaya…) et catalogue de produits ou services avec prix et TVA par défaut.",
  ],
  [
    "Équipe et rôles",
    "Propriétaire, administrateur, comptable, employé, lecteur : chacun ne fait que ce que son rôle permet. Plusieurs entreprises par compte.",
  ],
  [
    "Factures PDF",
    "PDF prêt à imprimer ou à envoyer, généré à partir des informations figées à l'émission : il reste exact même si le client est modifié ensuite.",
  ],
  [
    "Journal d'activité",
    "Émissions, annulations, paiements, changements de paramètres : les actions importantes sont tracées.",
  ],
];

export function Features() {
  return (
    <Section
      id="fonctionnalites"
      title="Tout ce qu'il faut pour facturer"
      intro="Les fonctions de base d'un outil de facturation, sans fioritures."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([t, d]) => (
          <li key={t} className="rounded-lg border bg-card p-5">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function AiSection() {
  const steps = [
    ["Vous décrivez", "« Crée une facture pour Société Atlas avec 3 ordinateurs à 85 000 DA »."],
    ["L'IA propose", "Elle comprend la demande et prépare un aperçu : client, lignes, quantités."],
    [
      "Le serveur calcule",
      "Les montants, la TVA et les totaux sont recalculés par le serveur, jamais par l'IA.",
    ],
    [
      "Vous confirmez",
      "Rien n'est enregistré sans votre accord, et le document créé reste un brouillon.",
    ],
  ];
  return (
    <Section
      id="ia"
      tone="paper"
      title="FacturDZ AI : l'IA propose, vous décidez"
      intro="L'assistant gagne du temps sur la saisie. Il n'émet jamais une facture à votre place."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <ol className="grid gap-5">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="text-sm text-muted-foreground">{d}</p>
              </div>
            </li>
          ))}
        </ol>
        <Shot
          src={aiShot}
          alt="Aperçu d'une facture proposée par l'assistant, avec totaux recalculés par le serveur"
          caption="Capture avec données de démonstration, assistant simulé."
        />
      </div>
      <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
        Vous pouvez aussi poser des questions sur votre activité (factures impayées, chiffre
        d&apos;affaires…) : l&apos;assistant lit vos chiffres sans jamais les modifier. Votre
        consommation est visible dans l&apos;application et plafonnée selon votre plan.
      </p>
    </Section>
  );
}

function Shot({
  src,
  alt,
  caption,
  sizes = "(min-width: 1024px) 640px, 100vw",
}: {
  src: typeof aiShot;
  alt: string;
  caption: string;
  sizes?: string;
}) {
  return (
    <figure>
      <Image src={src} alt={alt} sizes={sizes} className="w-full rounded-lg border shadow-sm" />
      <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

export function DashboardSection() {
  return (
    <Section
      id="dashboard"
      title="Un tableau de bord clair"
      intro="Facturé, encaissé, reste à encaisser et factures en retard, d'un coup d'œil, avec l'évolution sur 12 mois."
    >
      <Shot
        src={dashboardShot}
        alt="Tableau de bord : facturé, encaissé, reste à encaisser, en retard et graphique sur 12 mois"
        caption="Capture avec données de démonstration (entreprise fictive)."
        sizes="(min-width: 1152px) 1088px, 100vw"
      />
    </Section>
  );
}

export function PdfSection() {
  return (
    <Section
      id="pdf"
      tone="paper"
      title="Des factures PDF prêtes à l'emploi"
      intro="Le PDF reprend les informations de votre entreprise, du client et les lignes de la facture, avec le détail HT, TVA et TTC."
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
        <Shot
          src={invoiceShot}
          alt="Détail d'une facture émise dans l'application"
          caption="Capture avec données de démonstration."
        />
        <ul className="grid gap-3 text-sm text-muted-foreground">
          <li>
            Coordonnées figées à l&apos;émission : le document reste fidèle à ce qui a été émis.
          </li>
          <li>Facture annulée ou brouillon clairement identifiés, numéro jamais réutilisé.</li>
          <li>
            Les mentions légales (NIF, NIS, RC, article d&apos;imposition) sont celles que vous
            renseignez ; faites-les valider par votre comptable.
          </li>
          <li>Le PDF est en français ; l&apos;arabe n&apos;est pas encore pris en charge.</li>
        </ul>
      </div>
    </Section>
  );
}

const SECURITY: [string, string][] = [
  [
    "Données cloisonnées",
    "Chaque entreprise n'accède qu'à ses propres données : le cloisonnement est vérifié à chaque requête côté serveur et testé automatiquement.",
  ],
  [
    "Droits par rôle",
    "Les permissions sont contrôlées côté serveur à chaque action ; masquer un bouton ne suffit jamais.",
  ],
  [
    "Montants calculés côté serveur",
    "Un montant envoyé par le navigateur ou par l'IA n'est jamais cru : tout est recalculé et vérifié en base.",
  ],
  [
    "Secrets protégés",
    "Les clés des services d'IA restent sur le serveur, et un contrôle automatique vérifie qu'elles n'atteignent jamais le navigateur.",
  ],
  [
    "Protection contre les abus",
    "Limitation du nombre de connexions et d'opérations, en-têtes de sécurité et politique de contenu stricte.",
  ],
  ["Traçabilité", "Les actions sensibles sont inscrites au journal d'activité de l'entreprise."],
];

export function Security() {
  return (
    <Section
      id="securite"
      title="Sécurité"
      intro="Des mesures concrètes, vérifiées par des tests automatiques. Elles ne remplacent pas votre propre vigilance (mots de passe, accès de vos collaborateurs)."
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECURITY.map(([t, d]) => (
          <li key={t} className="rounded-lg border bg-card p-5">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const nf = new Intl.NumberFormat("fr-DZ");
const LIMIT_ROWS: [string, string, string][] = [
  ["INVOICES_PER_MONTH", "factures / mois", "Factures illimitées"],
  ["QUOTES_PER_MONTH", "devis / mois", "Devis illimités"],
  ["AI_REQUESTS_PER_MONTH", "requêtes IA / mois", "Requêtes IA illimitées"],
];

export function Pricing({ plans }: { plans: PublicPlan[] }) {
  return (
    <Section
      id="tarifs"
      tone="paper"
      title="Tarifs"
      intro="Les plafonds ci-dessous sont ceux réellement appliqués par l'application."
    >
      {plans.length === 0 ? (
        <p className="text-muted-foreground">Les tarifs seront communiqués prochainement.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const price = Number(p.priceMonthly);
            const label =
              p.code === "FREE" && price === 0
                ? "0 DA"
                : price > 0
                  ? `${nf.format(price)} ${p.currency === "DZD" ? "DA" : p.currency} / mois`
                  : "Tarif communiqué prochainement";
            return (
              <li key={p.code} className="flex flex-col rounded-lg border bg-card p-5">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 text-lg font-semibold text-primary">{label}</p>
                <ul className="mt-4 grid gap-1.5 text-sm text-muted-foreground">
                  {LIMIT_ROWS.map(([key, text, unlimited]) => {
                    const v = p.limits[key];
                    return (
                      <li key={key}>
                        {v === undefined || v === null
                          ? unlimited
                          : `${nf.format(Number(v))} ${text}`}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        Le paiement de l&apos;abonnement en ligne n&apos;est pas encore disponible : le plan de
        votre entreprise est attribué par l&apos;équipe FacturDZ.
      </p>
    </Section>
  );
}

const FAQ: [string, string][] = [
  [
    "Les taux de TVA sont-ils préconfigurés ?",
    "Non. Vous définissez les taux de votre entreprise ; aucun taux n'est imposé par l'application. Faites valider vos réglages et vos mentions légales par votre comptable.",
  ],
  [
    "FacturDZ AI peut-il émettre une facture tout seul ?",
    "Jamais. L'IA prépare un aperçu ; vous confirmez, et le document créé reste un brouillon que vous émettez vous-même.",
  ],
  [
    "L'IA peut-elle se tromper sur les montants ?",
    "Les montants ne viennent pas de l'IA : le serveur les recalcule à partir des quantités et prix. Vérifiez néanmoins l'aperçu (client, lignes) avant de confirmer.",
  ],
  [
    "Puis-je gérer plusieurs entreprises ?",
    "Oui. Un même compte peut appartenir à plusieurs entreprises, chacune avec ses clients, produits, numérotation et équipe.",
  ],
  [
    "Mes factures peuvent-elles avoir des numéros en double ?",
    "Non. La numérotation est attribuée à l'émission, par entreprise, de façon atomique ; le numéro d'une facture annulée n'est jamais réutilisé.",
  ],
  [
    "Puis-je payer ou faire payer mes clients en ligne ?",
    "Pas pour l'instant. Vous enregistrez les paiements reçus (espèces, virement, chèque…) ; il n'y a pas de passerelle de paiement en ligne.",
  ],
  ["L'application est-elle en arabe ?", "Pas encore : l'interface et les PDF sont en français."],
  [
    "Mes données sont-elles visibles par les autres entreprises ?",
    "Non. Le cloisonnement entre entreprises est contrôlé côté serveur et testé automatiquement.",
  ],
];

export function Faq() {
  return (
    <Section id="faq" title="Questions fréquentes">
      <div className="grid max-w-3xl gap-3">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group rounded-lg border bg-card p-4">
            <summary className="cursor-pointer font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {q}
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-5 px-4 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            Prêt à facturer plus simplement ?
          </h2>
          <p className="mt-2 opacity-90">
            Créez votre compte, renseignez votre entreprise et émettez votre première facture.
          </p>
        </div>
        <Link
          href={signedIn ? "/dashboard" : "/register"}
          className={cn(
            buttonVariants({ size: "lg" }),
            "bg-background text-foreground hover:bg-background/90",
          )}
        >
          {signedIn ? "Ouvrir l'application" : "Créer mon compte"}
        </Link>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-8">
        <p>© {new Date().getFullYear()} FacturDZ AI</p>
        <nav aria-label="Pied de page" className="flex gap-4">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Connexion
          </Link>
          <Link href="/register" className="underline-offset-4 hover:underline">
            Inscription
          </Link>
        </nav>
      </div>
    </footer>
  );
}
