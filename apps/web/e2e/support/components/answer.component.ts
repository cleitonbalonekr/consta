import { expect } from "@playwright/test";
import { BasePage } from "../base.page";

/** The streamed answer under the question form. */
export class AnswerComponent extends BasePage {
  get root() {
    return this.byId("answer");
  }

  get statements() {
    return this.byIdPrefix("statement-");
  }

  /** Every citation button in the answer, labelled "p. N" or "p. N · fls. F". */
  get citations() {
    return this.root.locator('[id^="citation-"]');
  }

  citation(statement: number, citation: number) {
    return this.byId(`citation-${statement}-${citation}`);
  }

  async waitUntilDone() {
    await expect(this.root).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  }

  async citationLabels() {
    return this.citations.allTextContents();
  }
}
