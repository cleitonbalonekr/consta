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

  /** The status in the header, on every step, ready included. */
  get badge() {
    return this.byId("case-file-status");
  }

  get unreadPages() {
    return this.byId("unread-pages-list");
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

  /** Ingestion runs in the E2E server's own process (CONSTA_JOBS=inline). */
  async expectReady() {
    await expect(this.badge).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  }

  /** Chooses the peça at that position in the document map, which scopes the next question to it. */
  async choosePeca(index: number) {
    await this.pecas.nth(index).click();
    await expect(this.byId("scope-peca")).toHaveAttribute("aria-pressed", "true");
  }

  async summarizePeca() {
    await this.byId("summarize-peca").click();
  }

  async ask(question: string) {
    await this.byId("question-input").fill(question);
    await this.byId("ask-button").click();
  }

  async runQuickAction(action: "timeline" | "people" | "amounts") {
    await this.byId(`quick-action-${action}`).click();
  }
}
