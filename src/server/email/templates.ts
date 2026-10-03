import "server-only";

/**
 * Modèles d'e-mails (français). HTML simple et robuste (tableaux, styles en ligne, pas d'images
 * distantes) + version texte. Toute valeur dynamique est échappée.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function layout(opts: {
  preheader: string;
  title: string;
  paragraphs: string[];
  cta: { label: string; url: string };
  footer: string;
}) {
  const url = esc(opts.cta.url);
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;background:#f6f7f5;font-family:Arial,Helvetica,sans-serif;color:#0b1220;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f5;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e7ee;border-radius:10px;">
<tr><td style="padding:24px 28px 0;font-size:16px;font-weight:bold;">FacturDZ <span style="color:#0f6b4f;">AI</span></td></tr>
<tr><td style="padding:16px 28px 0;font-size:20px;font-weight:bold;">${esc(opts.title)}</td></tr>
<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.55;">${opts.paragraphs.map((p) => `<p style="margin:0 0 12px;">${p}</p>`).join("")}</td></tr>
<tr><td style="padding:8px 28px 4px;"><a href="${url}" style="display:inline-block;background:#0f6b4f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:8px;">${esc(opts.cta.label)}</a></td></tr>
<tr><td style="padding:12px 28px 0;font-size:13px;line-height:1.5;color:#5b6578;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${url}</span></td></tr>
<tr><td style="padding:16px 28px 24px;font-size:13px;line-height:1.5;color:#5b6578;">${opts.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const hello = (name: string) => (name.trim() ? `Bonjour ${esc(name.trim())},` : "Bonjour,");
const helloText = (name: string) => (name.trim() ? `Bonjour ${name.trim()},` : "Bonjour,");

export function verificationEmail(input: {
  name: string;
  url: string;
  expiresInHours: number;
}): RenderedEmail {
  const subject = "Confirmez votre adresse e-mail FacturDZ AI";
  return {
    subject,
    html: layout({
      preheader: "Confirmez votre adresse pour activer votre compte.",
      title: "Confirmez votre adresse e-mail",
      paragraphs: [
        hello(input.name),
        "Merci de vous être inscrit sur FacturDZ AI. Confirmez votre adresse e-mail pour activer votre compte.",
        `Ce lien est valable ${input.expiresInHours} heure${input.expiresInHours > 1 ? "s" : ""} et ne peut servir qu'une fois.`,
      ],
      cta: { label: "Confirmer mon adresse", url: input.url },
      footer:
        "Vous n'êtes pas à l'origine de cette inscription ? Ignorez simplement cet e-mail : aucun compte ne sera activé.",
    }),
    text: `${helloText(input.name)}\n\nMerci de vous être inscrit sur FacturDZ AI. Confirmez votre adresse e-mail pour activer votre compte :\n${input.url}\n\nCe lien est valable ${input.expiresInHours} heure${input.expiresInHours > 1 ? "s" : ""} et ne peut servir qu'une fois.\nVous n'êtes pas à l'origine de cette inscription ? Ignorez cet e-mail.`,
  };
}

export function resetPasswordEmail(input: {
  name: string;
  url: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const subject = "Réinitialisation de votre mot de passe FacturDZ AI";
  return {
    subject,
    html: layout({
      preheader: "Choisissez un nouveau mot de passe.",
      title: "Réinitialiser votre mot de passe",
      paragraphs: [
        hello(input.name),
        "Une réinitialisation du mot de passe de votre compte FacturDZ AI a été demandée.",
        `Ce lien est valable ${input.expiresInMinutes} minutes et ne peut servir qu'une fois.`,
      ],
      cta: { label: "Choisir un nouveau mot de passe", url: input.url },
      footer:
        "Vous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe actuel reste inchangé. Ne transmettez jamais ce lien.",
    }),
    text: `${helloText(input.name)}\n\nUne réinitialisation du mot de passe de votre compte FacturDZ AI a été demandée. Choisissez un nouveau mot de passe :\n${input.url}\n\nCe lien est valable ${input.expiresInMinutes} minutes et ne peut servir qu'une fois.\nVous n'avez rien demandé ? Ignorez cet e-mail : votre mot de passe reste inchangé.`,
  };
}

export function passwordChangedEmail(input: { name: string; loginUrl: string }): RenderedEmail {
  const subject = "Votre mot de passe FacturDZ AI a été modifié";
  return {
    subject,
    html: layout({
      preheader: "Votre mot de passe vient d'être modifié.",
      title: "Mot de passe modifié",
      paragraphs: [
        hello(input.name),
        "Le mot de passe de votre compte FacturDZ AI vient d'être modifié et toutes vos sessions ont été fermées.",
      ],
      cta: { label: "Me connecter", url: input.loginUrl },
      footer:
        "Ce n'était pas vous ? Réinitialisez immédiatement votre mot de passe depuis la page de connexion (« Mot de passe oublié ») et contactez le support.",
    }),
    text: `${helloText(input.name)}\n\nLe mot de passe de votre compte FacturDZ AI vient d'être modifié et toutes vos sessions ont été fermées.\nCe n'était pas vous ? Réinitialisez immédiatement votre mot de passe via « Mot de passe oublié » :\n${input.loginUrl}`,
  };
}
