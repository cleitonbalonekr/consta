import { expect } from "@playwright/test";
import { BasePage } from "../../../support/base.page";

/** One case file: its ingestion progress, then its document map and questions. */
export class CaseFilePage extends BasePage {
  async goto(caseFileId: string) {
    await this.page.goto(`/autos/${caseFileId}`);
  }

  get status() {
    return this.byId("ingestion-status");
  }

  get pagesRead() {
    return this.byId("ingestion-pages");
  }

  get failure() {
    return this.byId("ingestion-failed");
  }

  get documentMap() {
    return this.byId("document-map");
  }

  get pecas() {
    return this.byIdPrefix("peca-row-");
  }

  async expectStep(status: string) {
    await expect(this.status).toHaveAttribute("data-status", status, { timeout: 10_000 });
  }

  async choosePeca(pecaId: string) {
    await this.byId(`peca-row-${pecaId}`).click();
    await expect(this.byId("scope-peca")).toHaveAttribute("aria-pressed", "true");
  }

  async ask(question: string) {
    await this.byId("question-input").fill(question);
    await this.byId("ask-button").click();
  }

  async runQuickAction(action: "timeline" | "people" | "amounts") {
    await this.byId(`quick-action-${action}`).click();
  }
}
