import { expect } from "@playwright/test";
import { BasePage } from "../../../support/base.page";
import { samplePdf } from "../../../support/sample-pdf";

/** The list of the lawyer's case files, where uploads start. */
export class CaseFileListPage extends BasePage {
  async goto() {
    await this.page.goto("/");
  }

  /** Uploads the sample PDF under another name, so each journey gets its own case file. */
  async upload(name: string) {
    await this.byId("upload-input").setInputFiles({ name, mimeType: "application/pdf", buffer: await samplePdf() });
  }

  /** Uploads and waits for the new case file's page. Returns its id. */
  async uploadAndOpen(name: string) {
    await this.upload(name);
    await this.page.waitForURL(/\/autos\/[^/]+$/);
    return this.page.url().split("/").at(-1)!;
  }

  row(caseFileId: string) {
    return this.byId(`case-file-row-${caseFileId}`);
  }

  get rows() {
    return this.byIdPrefix("case-file-row-");
  }

  get quotaExceeded() {
    return this.byId("quota-exceeded");
  }

  async startDeleting(caseFileId: string) {
    await this.byId(`delete-case-file-${caseFileId}`).click();
    await expect(this.byId(`confirm-delete-dialog-${caseFileId}`)).toBeVisible();
  }

  async cancelDeleting(caseFileId: string) {
    await this.byId(`cancel-delete-${caseFileId}`).click();
  }

  async confirmDeleting(caseFileId: string) {
    await this.byId(`confirm-delete-${caseFileId}`).click();
  }
}
