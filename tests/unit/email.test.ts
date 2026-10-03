import { describe, expect, it, vi } from "vitest";
import { createResendProvider } from "@/server/email/provider";
import {
  passwordChangedEmail,
  resetPasswordEmail,
  verificationEmail,
} from "@/server/email/templates";

const message = {
  to: "a@b.test",
  subject: "Sujet",
  html: "<p>x</p>",
  text: "x",
  idempotencyKey: "k-1",
};
const ok = () => new Response("{}", { status: 200 });

describe("fournisseur Resend", () => {
  it("envoie la requête attendue (clé en en-tête, jamais dans le corps)", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    await createResendProvider("re_cle_secrete", "FacturDZ <no-reply@x.dz>", f as never).send(
      message,
    );
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_cle_secrete");
    expect(init.headers["Idempotency-Key"]).toBe("k-1");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: "FacturDZ <no-reply@x.dz>",
      to: ["a@b.test"],
      subject: "Sujet",
    });
    expect(init.body).not.toContain("re_cle_secrete");
  });

  it("réessaie une fois sur 503 puis réussit", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(ok());
    await createResendProvider("k", "f@x.dz", f as never).send(message);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("ne réessaie pas sur une erreur client (401/422) et n'expose ni clé ni corps", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response('{"message":"cle re_cle_secrete invalide"}', { status: 401 }),
      );
    const err = await createResendProvider("re_cle_secrete", "f@x.dz", f as never)
      .send(message)
      .catch((e) => e);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(err.message)).toContain("401");
    expect(String(err.message)).not.toContain("re_cle_secrete");
  });

  it("échoue proprement après deux erreurs réseau", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createResendProvider("k", "f@x.dz", f as never).send(message)).rejects.toThrow(
      /Envoi d'e-mail impossible/,
    );
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("modèles d'e-mails", () => {
  const url =
    "https://app.facturdz.example/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email";

  it("contiennent le lien en HTML et en texte, en français", () => {
    for (const m of [
      verificationEmail({ name: "Amine", url, expiresInHours: 24 }),
      resetPasswordEmail({ name: "Amine", url, expiresInMinutes: 60 }),
      passwordChangedEmail({ name: "Amine", loginUrl: url }),
    ]) {
      expect(m.html).toContain('lang="fr"');
      expect(m.html).toContain("token=abc");
      expect(m.text).toContain(url);
      expect(m.subject).toMatch(/FacturDZ AI/);
    }
  });

  it("échappent les valeurs dynamiques (nom et lien) contre l'injection HTML", () => {
    const m = verificationEmail({
      name: '<script>alert(1)</script>"',
      url: 'https://x.test/?a="><img src=x>',
      expiresInHours: 1,
    });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain('"><img');
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("indiquent la durée de validité et la marche à suivre si on n'est pas à l'origine de la demande", () => {
    expect(resetPasswordEmail({ name: "", url, expiresInMinutes: 60 }).text).toMatch(/60 minutes/);
    expect(verificationEmail({ name: "", url, expiresInHours: 24 }).text).toMatch(/Ignorez/);
    expect(
      verificationEmail({ name: "", url, expiresInHours: 24 }).text.startsWith("Bonjour,"),
    ).toBe(true);
  });
});
