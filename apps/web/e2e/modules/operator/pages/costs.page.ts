import { BasePage } from "../../../support/base.page";

/** The operator's cost page: costs per lawyer and per case file, for one month. */
export class CostsPage extends BasePage {
  /** Returns the response, whose status tells whether the signed-in lawyer may see the page. */
  async goto() {
    return this.page.goto("/operador/custos");
  }

  get report() {
    return this.byId("costs-report");
  }

  /** A lawyer's row. Journeys know the lawyer by the email they signed in with. */
  lawyerRow(email: string) {
    return this.byIdPrefix("costs-lawyer-").filter({ hasText: email });
  }

  caseFileRow(name: string) {
    return this.byIdPrefix("costs-case-file-").filter({ hasText: name });
  }
}
