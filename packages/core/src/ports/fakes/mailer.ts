import type { Email, Mailer } from "../mailer";

export class InMemoryMailer implements Mailer {
  readonly outbox: Email[] = [];

  /** With `log`, sign-in links are also written there, so a lawyer can sign in locally without an email account. */
  constructor(private readonly log?: (line: string) => void) {}

  async send(email: Email) {
    this.outbox.push(email);
    if (email.template === "sign-in") this.log?.(`Sign-in link for ${email.to}: ${email.data.url}`);
  }
}
