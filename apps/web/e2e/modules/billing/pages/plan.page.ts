import { BasePage } from "../../../support/base.page";

/** The lawyer's plan, where they pay for Pro. */
export class PlanPage extends BasePage {
  async goto() {
    await this.page.goto("/plano");
  }

  get planName() {
    return this.byId("plan-name");
  }

  get pagesLeft() {
    return this.byId("plan-pages-left");
  }

  async upgradeToPro() {
    await this.byId("plan-upgrade-to-pro").click();
  }
}
