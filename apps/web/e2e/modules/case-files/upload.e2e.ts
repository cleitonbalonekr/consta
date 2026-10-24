import { expect, test, uniqueName } from "../../support/fixtures";
import { pdfWithPages, pdfWithText, twoPartPdf } from "../../support/sample-pdf";

test.describe("uploading a case file", () => {
  test("reads it page by page while the lawyer watches, then makes it ready", async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();

    // The Trial quota is 500 pages. This many take a few seconds to read, so the progress shows.
    await caseFileList.uploadAndOpen(uniqueName("Autos lidos"), await pdfWithText(400));

    await caseFile.expectStep("processing");
    await expect(caseFile.pagesRead).toContainText(/^\d+ de 400 páginas lidas$/);
    const first = Number((await caseFile.pagesRead.textContent())!.split(" ")[0]);
    await expect(async () => {
      const now = Number((await caseFile.pagesRead.textContent())!.split(" ")[0]);
      expect(now).toBeGreaterThan(first);
    }).toPass({ timeout: 30_000 });
    await caseFile.expectReady();
    await expect(caseFile.unreadPages).toHaveCount(0);
  });

  test("shows the lawyer the scanned pages that were not read", async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();

    await caseFileList.uploadAndOpen(uniqueName("Autos com digitalizações"), await pdfWithText(8, [3, 4, 7]));

    await caseFile.expectReady();
    await expect(caseFile.unreadPages).toHaveText("p. 3–4 e 7");
    await expect(caseFile.noText).toHaveCount(0);
  });

  test("tells the lawyer that a PDF of scans with no text can't be read yet", async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();

    await caseFileList.uploadAndOpen(uniqueName("Autos sem OCR"), await pdfWithText(2, [1, 2]));

    await caseFile.expectReady();
    await expect(caseFile.noText).toContainText("Este PDF não tem texto");
    await expect(caseFile.unreadPages).toHaveCount(0);
  });

  test("shows the new case file in the list", async ({ caseFileList, caseFile, page }) => {
    await caseFileList.goto();

    const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos enviados"));

    await caseFile.expectReady();
    await page.goBack();
    await expect(caseFileList.row(caseFileId)).toBeVisible();
  });

  test("is refused before sending anything when the page quota can't cover it", async ({ caseFileList, page }) => {
    const parts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT") parts.push(request.url());
    });
    await caseFileList.goto();

    // The Trial quota is 500 pages.
    await caseFileList.upload(uniqueName("Autos grandes demais"), await pdfWithPages(501));

    await expect(caseFileList.quotaExceeded).toBeVisible();
    await expect(page).toHaveURL("/");
    await expect(caseFileList.emptyList).toBeVisible();
    expect(parts).toEqual([]);
  });

  test("resumes after the network drops, sending only the parts that didn't arrive", async ({ caseFileList, caseFile, page }) => {
    const sentParts: string[] = [];
    let dropped = false;
    await page.route(/[?&]partNumber=\d+/, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      const partNumber = new URL(route.request().url()).searchParams.get("partNumber")!;
      if (partNumber === "2" && !dropped) {
        dropped = true;
        return route.abort("internetdisconnected");
      }
      sentParts.push(partNumber);
      return route.continue();
    });
    await caseFileList.goto();

    await caseFileList.upload(uniqueName("Autos interrompidos"), await twoPartPdf());
    await expect(caseFileList.uploadInterrupted).toBeVisible({ timeout: 30_000 });
    expect(sentParts).toEqual(["1"]);

    await caseFileList.resumeUpload();

    await page.waitForURL(/\/autos\/[^/]+$/, { timeout: 30_000 });
    await caseFile.expectReady();
    expect(sentParts).toEqual(["1", "2"]);
  });
});
