import { NotImplemented } from "@consta/core";
import type { Email, Mailer } from "@consta/core/ports";

export type ResendConfig = { apiKey: string; from: string };

type Message = { subject: string; text: string; html: string };

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/** Sends Consta's emails through Resend's HTTP API. The ingestion emails arrive with ticket 13. */
export function createResendMailer({ apiKey, from }: ResendConfig): Mailer {
  return {
    async send(email) {
      const response = await fetch(RESEND_EMAILS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email.to], ...render(email) }),
      });
      // The body may echo the recipient, so only the status goes into the error.
      if (!response.ok) throw new Error(`Resend refused the ${email.template} email with status ${response.status}.`);
    },
  };
}

function render(email: Email): Message {
  switch (email.template) {
    case "sign-in":
      return signIn(email.data.url);
    case "ingestion-ready":
    case "ingestion-failed":
      throw new NotImplemented(`ResendMailer ${email.template} email`);
  }
}

function signIn(url: string): Message {
  const intro = "Use o link abaixo para entrar no Consta. Ele expira em poucos minutos e só pode ser usado uma vez.";
  const ignore = "Se você não pediu este link, pode ignorar este email.";
  return {
    subject: "Seu link de acesso ao Consta",
    text: `${intro}\n\n${url}\n\n${ignore}`,
    html: `<p>${intro}</p><p><a href="${escapeHtml(url)}">Entrar no Consta</a></p><p>${ignore}</p>`,
  };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
