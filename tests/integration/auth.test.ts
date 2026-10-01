/**
 * Authentification (Better Auth) exécutée contre PostgreSQL.
 * Vérifie les garanties de sécurité de la configuration réelle de l'application.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth/auth";
import { testDb } from "./helpers";

const db = testDb();
afterAll(() => db.$disconnect());

const auth = createAuth({
  db,
  secret: "test-secret-0123456789-0123456789-abcdef",
  baseURL: "http://localhost:3000",
  rateLimit: false,
});

let n = 0;
const email = () => `user${Date.now()}${n++}@test.facturdz.test`;
const PASSWORD = "Mot-de-passe-solide-42";

function signUp(body: Record<string, unknown>) {
  return auth.api.signUpEmail({ body: { name: "Test", password: PASSWORD, ...body } as never });
}

describe("inscription", () => {
  it("crée l'utilisateur, un compte credential et une session en base", async () => {
    const e = email();
    const res = await signUp({ email: e, firstName: "Amine", lastName: "Test" });
    expect(res.user.email).toBe(e);

    const user = await db.user.findUniqueOrThrow({
      where: { email: e },
      include: { accounts: true, sessions: true },
    });
    expect(user.firstName).toBe("Amine");
    expect(user.platformRole).toBe("USER");
    expect(user.status).toBe("ACTIVE");
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0].providerId).toBe("credential");
    expect(user.sessions).toHaveLength(1);
  });

  it("ne stocke jamais le mot de passe en clair", async () => {
    const e = email();
    await signUp({ email: e });
    const account = await db.account.findFirstOrThrow({ where: { user: { email: e } } });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(PASSWORD);
    expect(account.password!.length).toBeGreaterThan(60);
  });

  it("empêche de se déclarer SUPER_ADMIN ou de fixer son statut à l'inscription", async () => {
    const e = email();
    await signUp({ email: e, platformRole: "SUPER_ADMIN", status: "ACTIVE" }).catch(() => null);
    const user = await db.user.findUnique({ where: { email: e } });
    // Soit l'inscription est refusée, soit les champs protégés sont ignorés.
    if (user) expect(user.platformRole).toBe("USER");
    expect(await db.user.count({ where: { platformRole: "SUPER_ADMIN" } })).toBe(0);
  });

  it("refuse un mot de passe trop court", async () => {
    await expect(signUp({ email: email(), password: "court" })).rejects.toThrow();
  });

  it("refuse une adresse déjà utilisée, quelle que soit la casse", async () => {
    const e = email();
    await signUp({ email: e });
    await expect(signUp({ email: e.toUpperCase() })).rejects.toThrow();
    expect(await db.user.count({ where: { email: { equals: e, mode: "insensitive" } } })).toBe(1);
  });
});

describe("connexion", () => {
  it("accepte le bon mot de passe et refuse un mauvais", async () => {
    const e = email();
    await signUp({ email: e });
    await expect(
      auth.api.signInEmail({ body: { email: e, password: PASSWORD } }),
    ).resolves.toMatchObject({
      user: { email: e },
    });
    await expect(
      auth.api.signInEmail({ body: { email: e, password: "Mauvais-mot-de-passe" } }),
    ).rejects.toThrow();
  });

  it("refuse la connexion d'un compte suspendu", async () => {
    const e = email();
    await signUp({ email: e });
    await db.user.update({ where: { email: e }, data: { status: "SUSPENDED" } });
    await expect(
      auth.api.signInEmail({ body: { email: e, password: PASSWORD } }),
    ).rejects.toThrow();
  });

  it("une session supprimée en base n'est plus reconnue (pas de cache cookie)", async () => {
    const e = email();
    await signUp({ email: e });
    const res = await auth.api.signInEmail({
      body: { email: e, password: PASSWORD },
      asResponse: true,
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/facturdz\.session_token=/);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");

    const headers = new Headers({ cookie: cookie.split(";")[0] });
    await expect(auth.api.getSession({ headers })).resolves.toMatchObject({ user: { email: e } });

    await db.session.deleteMany({ where: { user: { email: e } } });
    await expect(auth.api.getSession({ headers })).resolves.toBeNull();
  });
});
