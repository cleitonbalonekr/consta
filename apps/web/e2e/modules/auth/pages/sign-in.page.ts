import { expect } from "@playwright/test";
import { BasePage } from "../../../support/base.page";
import { signInLinkFor } from "../../../support/server-log";

/** Where a lawyer asks for a sign-in link. */
export class SignInPage extends BasePage {
  async goto() {
    await this.page.goto("/entrar");
  }

  get linkSent() {
    return this.byId("sign-in-link-sent");
  }

  async requestLink(email: string) {
    await this.byId("sign-in-email").fill(email);
    await this.byId("send-sign-in-link").click();
    await expect(this.linkSent).toBeVisible();
  }

  /** Opens the sign-in link the server logged for this email. */
  async openLoggedLink(email: string) {
    await this.page.goto(await signInLinkFor(email));
  }

  /** The whole journey, ending on the lawyer's case file list. */
  async signIn(email: string) {
    await this.goto();
    await this.requestLink(email);
    await this.openLoggedLink(email);
    await expect(this.page).toHaveURL("/");
  }
}
