import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Parcours critiques dans un vrai navigateur (base de démo `pnpm db:seed`).
 * Couvrent ce que les tests d'intégration ne peuvent pas voir : cookies de session, proxy,
 * CSP (aucune violation), pages protégées, 404 de l'admin, PDF, isolation entre entreprises.
 */
const PASSWORD = "Demo-FacturDZ-2026";

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.locator("button[type=submit]").click();
}

/**
 * Better Auth limite la connexion à 5 par minute (c'est voulu) : chaque compte ne se connecte
 * donc qu'UNE fois, la session est ensuite réutilisée par les autres tests.
 */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function newSession(browser: Browser, email: string) {
  const saved = sessions.get(email);
  const context = await browser.newContext(saved ? { storageState: saved } : {});
  const page = await context.newPage();
  if (!saved) {
    await login(page, email);
    await page.waitForURL(/dashboard|onboarding|admin/);
    sessions.set(email, await context.storageState());
  } else {
    await page.goto("/dashboard");
  }
  return { context, page };
}

function trackCspViolations(page: Page) {
  const bad: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) bad.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => bad.push(e.message));
  return bad;
}

test("pages protégées : redirection vers la connexion sans session", async ({ page }) => {
  for (const path of ["/dashboard", "/invoices", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("mauvais mot de passe : refus sans accès", async ({ page }) => {
  await login(page, "owner@demo.facturdz.test", "mauvais-mot-de-passe-1");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("propriétaire : tableau de bord, factures, PDF, sans violation CSP", async ({ browser }) => {
  const { context, page } = await newSession(browser, "owner@demo.facturdz.test");
  const violations = trackCspViolations(page);
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Factures" }).first()).toBeVisible();
  const href = await page
    .locator("a[href*='/invoices/']")
    .evaluateAll((as) =>
      as
        .map((a) => a.getAttribute("href")!)
        .find((h) => /\/invoices\/[^/]+$/.test(h) && !h.endsWith("/new")),
    );
  expect(href).toBeTruthy();
  const pdf = await context.request.get(`${href}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const csp = (await page.request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("nonce-");
  expect(violations).toEqual([]);
  await context.close();
});

test("administration : 404 pour le propriétaire, accessible au super admin", async ({
  browser,
}) => {
  const owner = await newSession(browser, "owner@demo.facturdz.test");
  expect((await owner.page.goto("/admin"))?.status()).toBe(404);
  expect((await owner.page.goto("/admin/users"))?.status()).toBe(404);
  await owner.context.close();

  const admin = await newSession(browser, "admin@demo.facturdz.test");
  expect((await admin.page.goto("/admin"))?.status()).toBe(200);
  await expect(admin.page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
  await admin.context.close();
});

test("isolation : une autre entreprise ne voit ni la facture ni son PDF", async ({ browser }) => {
  const owner = await newSession(browser, "owner@demo.facturdz.test");
  await owner.page.goto("/invoices");
  const href = await owner.page
    .locator("a[href*='/invoices/']")
    .evaluateAll((as) =>
      as
        .map((a) => a.getAttribute("href")!)
        .find((h) => /\/invoices\/[^/]+$/.test(h) && !h.endsWith("/new")),
    );
  await owner.context.close();

  // Nouveau compte, nouvelle entreprise.
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `e2e-${Date.now()}@e2e.facturdz.test`;
  await page.goto("/register");
  await page.getByLabel("Prénom").fill("Autre");
  await page.getByLabel("Nom", { exact: true }).fill("Entreprise");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe").fill("Mot-de-passe-E2E-2026!");
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/onboarding|dashboard/);
  if (/onboarding/.test(page.url())) {
    await page.getByLabel("Nom de l'entreprise").fill("Entreprise E2E");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(/dashboard/);
  }
  expect((await page.goto(href!))?.status()).toBe(404);
  expect((await context.request.get(`${href}/pdf`)).status()).toBe(404);
  expect((await page.goto("/admin"))?.status()).toBe(404);
  await context.close();
});

test("assistant IA : rien n'est enregistré avant confirmation, puis un simple brouillon", async ({
  browser,
}) => {
  const { context, page } = await newSession(browser, "owner@demo.facturdz.test");
  const countInvoices = async (p: Page) => {
    await p.goto("/invoices");
    return p
      .locator("a[href*='/invoices/']")
      .evaluateAll(
        (as) =>
          as.filter(
            (a) =>
              /\/invoices\/[^/]+$/.test(a.getAttribute("href")!) &&
              !a.getAttribute("href")!.endsWith("/new"),
          ).length,
      );
  };
  const before = await countInvoices(page);

  await page.goto("/ai");
  await page
    .getByRole("textbox")
    .first()
    .fill("Crée une facture pour un client avec 2 articles à 5000 DA");
  await page.getByRole("button", { name: /Préparer la facture/ }).click();
  await expect(page.getByRole("region", { name: "Aperçu" })).toBeVisible({ timeout: 20_000 });

  const other = await context.newPage();
  expect(await countInvoices(other)).toBe(before); // proposition seulement : aucune facture créée
  await other.close();

  const create = page.getByRole("button", { name: /Créer le brouillon/ });
  if (await create.isEnabled()) {
    await create.click();
    await page.waitForURL(/\/invoices\//, { timeout: 20_000 });
    await expect(page.getByText(/brouillon/i).first()).toBeVisible();
    expect(await countInvoices(page)).toBe(before + 1);
  }
  await context.close();
});

test("page d'accueil publique : contenu, appels à l'action, sans violation CSP", async ({
  page,
}) => {
  const violations = trackCspViolations(page);
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "Facturez plus simplement avec FacturDZ AI." }),
  ).toBeVisible();
  for (const id of ["fonctionnalites", "ia", "dashboard", "pdf", "securite", "tarifs", "faq"]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await page.getByRole("link", { name: "Créer mon compte" }).first().click();
  await expect(page).toHaveURL(/\/register/);
  // Aucune fausse statistique ni preuve sociale (« +10 000 clients », « 99 % de satisfaction »…). Le « TVA 19 % » du talon de démonstration est un exemple de calcul, pas une statistique.
  await page.goto("/");
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(
    /\d+\s?%\s+(de |des |d')?(satisfaction|satisfaits|clients|entreprises|utilisateurs|gain|économie|plus rapide)|ils nous font confiance|témoignage|\+\s?\d{2,}\s+(clients|entreprises|utilisateurs)/i,
  );
  expect(violations).toEqual([]);
});

test("mot de passe oublié : même message pour une adresse connue et inconnue", async ({ page }) => {
  const messages: string[] = [];
  for (const email of ["owner@demo.facturdz.test", `inconnu-${Date.now()}@e2e.facturdz.test`]) {
    await page.goto("/forgot-password");
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    const notice = page.getByRole("status").filter({ hasText: "Si un compte existe" });
    await expect(notice).toBeVisible();
    messages.push(await notice.innerText());
  }
  expect(messages[0]).toBe(messages[1]);
  await page.goto("/reset-password");
  await expect(page.getByText("invalide ou a expiré")).toBeVisible();
  await page.goto("/reset-password?token=forge");
  await page.getByLabel("Nouveau mot de passe").fill("Un-nouveau-mot-de-passe-1");
  await page.getByLabel("Confirmer le mot de passe").fill("Un-nouveau-mot-de-passe-1");
  await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await expect(page.getByText(/invalide ou a expiré|n'a pas pu être modifié/)).toBeVisible();
});
