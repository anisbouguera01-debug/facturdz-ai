/**
 * Vérification d'adresse e-mail et réinitialisation du mot de passe, contre PostgreSQL et la
 * vraie configuration Better Auth (e-mails capturés en mémoire, aucun envoi réel).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, flushPendingMail } from "@/server/auth/auth";
import type { EmailMessage } from "@/server/email/provider";
import { testDb } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

const outbox: EmailMessage[] = [];
let failMail = false;
const auth = createAuth({
  db,
  secret: "test-secret-0123456789-0123456789-abcdef",
  baseURL: "http://localhost:3000",
  rateLimit: false,
  requireEmailVerification: true,
  mailer: async (m) => {
    if (failMail) throw new Error("fournisseur indisponible");
    outbox.push(m);
  },
});

let n = 0;
const email = () => `mail${Date.now()}${n++}@test.facturdz.test`;
const PASSWORD = "Mot-de-passe-solide-42";
const NEW_PASSWORD = "Nouveau-mot-de-passe-77";
beforeEach(() => {
  outbox.length = 0;
  failMail = false;
});

const to = (e: string) => outbox.filter((m) => m.to === e);
const tokenOf = (m: EmailMessage) =>
  new URL(/https?:\/\/\S+/.exec(m.text)![0]).searchParams.get("token") ??
  new URL(/https?:\/\/\S+/.exec(m.text)![0]).pathname.split("/").pop()!;

async function register(e: string) {
  const res = await auth.api.signUpEmail({
    body: {
      name: "Amine Test",
      email: e,
      password: PASSWORD,
      callbackURL: "/verify-email",
    } as never,
  });
  await flushPendingMail();
  return res;
}

describe("vérification d'adresse", () => {
  it("l'inscription n'ouvre pas de session et envoie un lien de confirmation", async () => {
    const e = email();
    const res = await register(e);
    expect(res.token).toBeNull();
    expect(await db.session.count({ where: { user: { email: e } } })).toBe(0);
    expect(to(e)).toHaveLength(1);
    expect(to(e)[0]!.subject).toMatch(/Confirmez/);
    expect(to(e)[0]!.html).toContain("Amine Test");
  });

  it("refuse la connexion tant que l'adresse n'est pas confirmée, et renvoie un lien", async () => {
    const e = email();
    await register(e);
    outbox.length = 0;
    await expect(
      auth.api.signInEmail({ body: { email: e, password: PASSWORD } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    await flushPendingMail();
    expect(to(e)).toHaveLength(1); // nouveau lien envoyé à la tentative de connexion
  });

  it("le lien confirme l'adresse et ouvre ensuite la session ; un mauvais jeton est refusé", async () => {
    const e = email();
    await register(e);
    await expect(auth.api.verifyEmail({ query: { token: "jeton-forge" } })).rejects.toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { email: e } })).emailVerified).toBe(false);

    await auth.api.verifyEmail({ query: { token: tokenOf(to(e)[0]!) } });
    expect((await db.user.findUniqueOrThrow({ where: { email: e } })).emailVerified).toBe(true);
    const session = await auth.api.signInEmail({ body: { email: e, password: PASSWORD } });
    expect(session.user.email).toBe(e);
  });

  it("un échec du fournisseur d'e-mail n'empêche pas l'inscription (et n'expose rien)", async () => {
    failMail = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const e = email();
    const res = await register(e);
    expect(res.user.email).toBe(e);
    expect(outbox).toHaveLength(0);
    spy.mockRestore();
  });
});

describe("mot de passe oublié", () => {
  async function verified() {
    const e = email();
    await register(e);
    await auth.api.verifyEmail({ query: { token: tokenOf(to(e)[0]!) } });
    outbox.length = 0;
    return e;
  }

  it("envoie un lien valable 1 h pour un compte existant ; aucun e-mail pour une adresse inconnue", async () => {
    const e = await verified();
    const known = await auth.api.requestPasswordReset({
      body: { email: e, redirectTo: "/reset-password" },
    });
    const unknown = await auth.api.requestPasswordReset({
      body: { email: email(), redirectTo: "/reset-password" },
    });
    await flushPendingMail();
    expect(known).toEqual(unknown); // même réponse : pas d'énumération de comptes
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe(e);
    expect(outbox[0]!.text).toContain("60 minutes");
  });

  it("change le mot de passe, ferme les sessions, prévient par e-mail, jeton à usage unique", async () => {
    const e = await verified();
    await auth.api.signInEmail({ body: { email: e, password: PASSWORD } });
    expect(await db.session.count({ where: { user: { email: e } } })).toBeGreaterThan(0);
    outbox.length = 0;

    await auth.api.requestPasswordReset({ body: { email: e, redirectTo: "/reset-password" } });
    await flushPendingMail();
    const token = tokenOf(outbox[0]!);
    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token } });
    await flushPendingMail();

    expect(await db.session.count({ where: { user: { email: e } } })).toBe(0);
    await expect(
      auth.api.signInEmail({ body: { email: e, password: PASSWORD } }),
    ).rejects.toBeTruthy();
    const ok = await auth.api.signInEmail({ body: { email: e, password: NEW_PASSWORD } });
    expect(ok.user.email).toBe(e);
    expect(outbox.some((m) => /modifié/.test(m.subject))).toBe(true);
    await expect(
      auth.api.resetPassword({ body: { newPassword: "Encore-un-autre-88", token } }),
    ).rejects.toBeTruthy();
  });

  it("refuse un jeton forgé et un nouveau mot de passe trop court", async () => {
    const e = await verified();
    await expect(
      auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token: "forge" } }),
    ).rejects.toBeTruthy();
    await auth.api.requestPasswordReset({ body: { email: e, redirectTo: "/reset-password" } });
    await flushPendingMail();
    await expect(
      auth.api.resetPassword({ body: { newPassword: "court", token: tokenOf(outbox[0]!) } }),
    ).rejects.toBeTruthy();
  });
});
