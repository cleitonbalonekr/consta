import { expect, test, uniqueName } from "../../support/fixtures";

test.describe("uploading a case file", () => {
  test("goes from queued to ready page by page, then shows the document map", async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();

    await caseFileList.uploadAndOpen(uniqueName("Autos enviados"));

    await caseFile.expectStep("processing");
    await expect(caseFile.pagesRead).toContainText(/\d+ de 10 páginas lidas/);
    await caseFile.expectStep("mapping");
    await expect(caseFile.documentMap).toBeVisible({ timeout: 10_000 });
    await expect(caseFile.pecas).toHaveCount(3);
  });

  test("shows the new case file in the list", async ({ caseFileList, page }) => {
    await caseFileList.goto();
    const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos listados"));

    await page.goBack();

    await expect(caseFileList.row(caseFileId)).toBeVisible();
  });

  test("is refused before sending anything when the page quota can't cover it", async ({ caseFileList, page }) => {
    await caseFileList.goto();

    await caseFileList.upload(uniqueName("autos-sem-cota"));

    await expect(caseFileList.quotaExceeded).toBeVisible();
    await expect(page).toHaveURL("/");
  });

  test("shows why ingestion failed", async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();

    await caseFileList.uploadAndOpen(uniqueName("autos-falha"));

    await expect(caseFile.failure).toBeVisible({ timeout: 10_000 });
    await expect(caseFile.failure).toContainText("página 5");
  });
});
