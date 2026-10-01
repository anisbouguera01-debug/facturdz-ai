/**
 * Seed de développement — données 100 % FICTIVES.
 *
 * Idempotent : l'organisation de démonstration et ses utilisateurs sont supprimés
 * puis recréés ; plans et limites sont mis à jour en place.
 *
 * Contenu actuel : plans, 1 organisation, 2 utilisateurs avec mot de passe
 * (« Demo-FacturDZ-2026 »), taux de TVA, 10 clients, 20 produits, compteurs.
 * Ajouts prévus : devis/factures/paiements
 * via les services de calcul (Phases 7–9), logs IA (Phase 15).
 *
 * Refuse de s'exécuter en production.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import type { LimitKey } from "../src/generated/prisma/enums";

const DEMO_SLUG = "demo-sarl-atlas";
// Mot de passe des comptes de démonstration (développement uniquement).
const DEMO_PASSWORD = "Demo-FacturDZ-2026";

// Valeurs d'exemple reprises du cahier des charges ; modifiables en base, jamais codées ailleurs.
// null = illimité.
const PLANS: {
  code: string;
  name: string;
  priceMonthly: string;
  limits: Partial<Record<LimitKey, number | null>>;
}[] = [
  {
    code: "FREE",
    name: "Gratuit",
    priceMonthly: "0",
    limits: { INVOICES_PER_MONTH: 50, QUOTES_PER_MONTH: 50, MEMBERS: 1, AI_REQUESTS_PER_MONTH: 20 },
  },
  {
    code: "BASIC",
    name: "Basic",
    priceMonthly: "0",
    limits: {
      INVOICES_PER_MONTH: 200,
      QUOTES_PER_MONTH: 200,
      MEMBERS: 2,
      AI_REQUESTS_PER_MONTH: 100,
    },
  },
  {
    code: "PRO",
    name: "Pro",
    priceMonthly: "0",
    limits: {
      INVOICES_PER_MONTH: 500,
      QUOTES_PER_MONTH: 500,
      MEMBERS: 5,
      AI_REQUESTS_PER_MONTH: 500,
    },
  },
  {
    code: "BUSINESS",
    name: "Business",
    priceMonthly: "0",
    limits: {
      INVOICES_PER_MONTH: null,
      QUOTES_PER_MONTH: null,
      MEMBERS: 20,
      AI_REQUESTS_PER_MONTH: 2000,
    },
  },
];

const CUSTOMERS = [
  ["SARL Numidia Tech", "Alger", "Bab Ezzouar"],
  ["EURL Oasis Distribution", "Oran", "Bir El Djir"],
  ["SPA Cirta Industries", "Constantine", "El Khroub"],
  ["SARL Mitidja Agro", "Blida", "Boufarik"],
  ["EURL Hauts Plateaux Services", "Sétif", "El Eulma"],
  ["SARL Hippone Logistique", "Annaba", "El Bouni"],
  ["EURL Djurdjura Bâtiment", "Tizi Ouzou", "Azazga"],
  ["SARL Soummam Import", "Béjaïa", "Akbou"],
  ["EURL Zianides Conseil", "Tlemcen", "Mansourah"],
  ["SARL Aurès Équipements", "Batna", "Barika"],
] as const;

const PRODUCTS: [string, "PRODUCT" | "SERVICE", string, string, "19" | "9"][] = [
  ['Ordinateur portable 15"', "PRODUCT", "unité", "85000", "19"],
  ["Imprimante laser", "PRODUCT", "unité", "25000", "19"],
  ['Écran 24"', "PRODUCT", "unité", "28000", "19"],
  ["Clavier + souris sans fil", "PRODUCT", "lot", "4500", "19"],
  ["Onduleur 1500 VA", "PRODUCT", "unité", "32000", "19"],
  ["Disque SSD 1 To", "PRODUCT", "unité", "14000", "19"],
  ["Routeur Wi-Fi", "PRODUCT", "unité", "9500", "19"],
  ["Câble réseau Cat6 (305 m)", "PRODUCT", "bobine", "18000", "19"],
  ["Ramette papier A4", "PRODUCT", "carton", "6500", "9"],
  ["Toner imprimante", "PRODUCT", "unité", "7800", "19"],
  ["Installation poste de travail", "SERVICE", "intervention", "3000", "19"],
  ["Maintenance mensuelle", "SERVICE", "mois", "15000", "19"],
  ["Formation bureautique", "SERVICE", "jour", "20000", "19"],
  ["Audit réseau", "SERVICE", "forfait", "60000", "19"],
  ["Développement site vitrine", "SERVICE", "forfait", "150000", "19"],
  ["Hébergement web annuel", "SERVICE", "an", "24000", "19"],
  ["Support à distance", "SERVICE", "heure", "2500", "19"],
  ["Câblage réseau", "SERVICE", "point", "3500", "19"],
  ["Sauvegarde externalisée", "SERVICE", "mois", "8000", "19"],
  ["Conseil informatique", "SERVICE", "jour", "35000", "19"],
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error("Seed refusé : environnement de production.");
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    // Plans et limites (globaux) : mise à jour en place.
    const plans: Record<string, string> = {};
    for (const p of PLANS) {
      const plan = await db.subscriptionPlan.upsert({
        where: { code: p.code },
        update: { name: p.name, priceMonthly: new Prisma.Decimal(p.priceMonthly) },
        create: { code: p.code, name: p.name, priceMonthly: new Prisma.Decimal(p.priceMonthly) },
      });
      plans[p.code] = plan.id;
      for (const [key, value] of Object.entries(p.limits) as [LimitKey, number | null][]) {
        const v = value === null ? null : new Prisma.Decimal(value);
        await db.usageLimit.upsert({
          where: { planId_key: { planId: plan.id, key } },
          update: { value: v },
          create: { planId: plan.id, key, value: v },
        });
      }
    }

    // Organisation de démonstration : suppression complète puis recréation.
    await db.organization.deleteMany({ where: { slug: DEMO_SLUG } });
    await db.user.deleteMany({
      where: { email: { in: ["owner@demo.facturdz.test", "comptable@demo.facturdz.test"] } },
    });

    const year = new Date().getFullYear();
    const now = new Date();

    const org = await db.organization.create({
      data: {
        name: "Atlas Informatique",
        slug: DEMO_SLUG,
        legalName: "SARL Atlas Informatique (démo)",
        address: "12 rue fictive",
        wilaya: "Alger",
        commune: "Hydra",
        phone: "+213 000 00 00 00",
        email: "contact@demo.facturdz.test",
        nif: "DEMO-NIF-0001",
        nis: "DEMO-NIS-0001",
        rc: "DEMO-RC-0001",
        articleImposition: "DEMO-AI-0001",
        invoiceSettings: {
          defaultPaymentTermsDays: 30,
          defaultNotes: "Merci pour votre confiance.",
        },
        aiSettings: {},
        subscription: {
          create: {
            planId: plans.PRO,
            status: "ACTIVE",
            currentPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
            currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        },
        sequences: {
          create: [
            { documentType: "INVOICE", year, prefix: "FAC" },
            { documentType: "QUOTE", year, prefix: "DEV" },
          ],
        },
        // Taux d'exemple pour le développement : à valider par un comptable avant production.
        taxRates: {
          create: [
            { label: "TVA 19 %", rate: new Prisma.Decimal("19"), isDefault: true },
            { label: "TVA 9 %", rate: new Prisma.Decimal("9") },
            { label: "Exonéré", rate: new Prisma.Decimal("0") },
          ],
        },
      },
    });

    // Utilisateurs avec identifiants de connexion (mot de passe haché comme Better Auth).
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const credential = (userId: string) => ({
      create: { accountId: userId, providerId: "credential", password: passwordHash },
    });
    const owner = await db.user.create({
      data: {
        email: "owner@demo.facturdz.test",
        emailVerified: true,
        name: "Yacine Demo",
        firstName: "Yacine",
        lastName: "Demo",
        memberships: { create: { organizationId: org.id, role: "OWNER" } },
      },
    });
    await db.user.update({ where: { id: owner.id }, data: { accounts: credential(owner.id) } });
    const accountant = await db.user.create({
      data: {
        email: "comptable@demo.facturdz.test",
        emailVerified: true,
        name: "Samia Demo",
        firstName: "Samia",
        lastName: "Demo",
        memberships: { create: { organizationId: org.id, role: "ACCOUNTANT" } },
      },
    });
    await db.user.update({
      where: { id: accountant.id },
      data: { accounts: credential(accountant.id) },
    });

    await db.customer.createMany({
      data: CUSTOMERS.map(([name, wilaya, commune], i) => ({
        organizationId: org.id,
        type: "COMPANY" as const,
        name,
        companyName: name,
        email: `client${i + 1}@demo.facturdz.test`,
        phone: `+213 000 00 00 ${String(i + 1).padStart(2, "0")}`,
        wilaya,
        commune,
        nif: `DEMO-NIF-C${String(i + 1).padStart(3, "0")}`,
      })),
    });

    await db.product.createMany({
      data: PRODUCTS.map(([name, type, unit, price, vat], i) => ({
        organizationId: org.id,
        name,
        type,
        unit,
        sku: `${type === "PRODUCT" ? "PRD" : "SRV"}-${String(i + 1).padStart(3, "0")}`,
        priceHT: new Prisma.Decimal(price),
        vatRate: new Prisma.Decimal(vat),
      })),
    });

    const counts = {
      plans: await db.subscriptionPlan.count(),
      customers: await db.customer.count({ where: { organizationId: org.id } }),
      products: await db.product.count({ where: { organizationId: org.id } }),
      members: await db.organizationMember.count({ where: { organizationId: org.id } }),
    };
    console.log(
      `✔ Seed terminé — organisation « ${org.name} »\n` +
        `  Connexion : ${owner.email} (OWNER) ou ${accountant.email} (ACCOUNTANT)\n` +
        `  Mot de passe : ${DEMO_PASSWORD}`,
      counts,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
