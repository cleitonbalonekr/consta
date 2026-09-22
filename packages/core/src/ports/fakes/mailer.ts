import type { Email, Mailer } from "../mailer";

export class InMemoryMailer implements Mailer {
  readonly outbox: Email[] = [];

  async send(email: Email) {
    this.outbox.push(email);
  }
}
