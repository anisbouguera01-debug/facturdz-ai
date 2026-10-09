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

test("pages légales : accessibles sans session, avertissement visible, liées depuis l'accueil", async ({
  page,
}) => {
  const bad: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) bad.push(m.text().slice(0, 200));
  });
  for (const [href, title] of [
    ["/mentions-legales", /mentions légales/i],
    ["/cgu", /conditions/i],
    ["/confidentialite", /confidentialité/i],
  ] as const) {
    await page.goto("/");
    await expect(page.locator(`footer a[href="${href}"]`).first()).toBeVisible();
    const res = await page.goto(href);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await expect(page.getByText(/validé|validation juridique/i).first()).toBeVisible();
  }
  expect(bad).toEqual([]);
});

test("mobile (iPhone) : menu tactile, navigation et aucun débordement horizontal", async ({
  browser,
}) => {
  const saved = sessions.get("owner@demo.facturdz.test");
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    ...(saved ? { storageState: saved } : {}),
  });
  const page = await context.newPage();
  if (!saved) await login(page, "owner@demo.facturdz.test");
  await page.goto("/dashboard");
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  await page.getByRole("button", { name: "Ouvrir le menu" }).tap();
  const menu = page.getByRole("dialog", { name: "Menu principal" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Factures" }).tap();
  await page.waitForURL(/\/invoices$/);
  await expect(menu).toBeHidden();
  for (const path of ["/dashboard", "/invoices", "/invoices/new", "/customers", "/ai"]) {
    await page.goto(path);
    expect(await overflow(), `${path} déborde`).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test("factures : le filtre de période change réellement la liste (préréglage et dates)", async ({
  browser,
}) => {
  const { context, page } = await newSession(browser, "owner@demo.facturdz.test");
  const rows = async () => {
    await page.waitForLoadState("networkidle");
    return page.locator("table tbody tr").count();
  };
  await page.goto("/invoices");
  const all = await rows();
  expect(all).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Ce mois" }).click();
  await page.waitForURL(/period=month/);
  await expect(page.getByRole("link", { name: "Ce mois" })).toHaveAttribute("aria-current", "true");

  // Une période lointaine sans facture : état vide, pas de simple filtre visuel.
  await page.goto("/invoices?period=custom&from=2001-01-01&to=2001-01-31");
  await expect(page.getByText("Aucune facture ne correspond à ces filtres.")).toBeVisible();

  // Dates invalides : message d'erreur, aucun filtre appliqué.
  await page.goto("/invoices?period=custom&from=2026-02-30");
  await expect(page.getByRole("alert").filter({ hasText: "Date invalide" })).toBeVisible();
  expect(await rows()).toBe(all);

  // Saisie des dates dans le formulaire.
  await page.goto("/invoices");
  await page.locator("#from").fill("2001-01-01");
  await page.locator("#to").fill("2001-01-31");
  await page.getByRole("button", { name: "Filtrer" }).click();
  await page.waitForURL(/from=2001-01-01/);
  await expect(page.getByText("Aucune facture ne correspond à ces filtres.")).toBeVisible();
  await context.close();
});

test("impression : seul le document est imprimé (navigation et boutons masqués)", async ({
  browser,
}) => {
  const { context, page } = await newSession(browser, "owner@demo.facturdz.test");
  await page.goto("/invoices");
  await page.locator("table tbody a[href^='/invoices/']").first().click();
  await page.waitForURL(/\/invoices\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Imprimer" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
  await expect(page.getByRole("table", { name: "Lignes du document" })).toBeVisible();
  await context.close();
});

test("administration : filtres de statut côté serveur et confirmation avant suspension", async ({
  browser,
}) => {
  const { context, page } = await newSession(browser, "admin@demo.facturdz.test");
  await page.goto("/admin/users?status=SUSPENDED");
  await expect(page.getByText("Aucun utilisateur ne correspond.")).toBeVisible();
  await page.goto("/admin/users?status=ACTIVE");
  const suspend = page.getByRole("button", { name: "Suspendre" }).first();
  await suspend.click();
  const dialog = page.getByRole("dialog", { name: "Suspendre ce compte ?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toBeHidden();
  await context.close();
});
