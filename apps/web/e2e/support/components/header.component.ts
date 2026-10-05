import { expect } from "@playwright/test";
import { BasePage } from "../base.page";

/** The bar at the top of every page. */
export class HeaderComponent extends BasePage {
  get signedInEmail() {
    return this.byId("signed-in-email");
  }

  async signOut() {
    await this.byId("sign-out").click();
    await expect(this.page).toHaveURL("/entrar");
  }
}
