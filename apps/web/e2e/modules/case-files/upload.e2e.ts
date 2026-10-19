import { expect, test, uniqueName } from "../../support/fixtures";
import { pdfWithPages, twoPartPdf } from "../../support/sample-pdf";

test.describe("uploading a case file", () => {
  test("queues the case file for reading and shows it in the list", async ({ caseFileList, caseFile, page }) => {
    await caseFileList.goto();

    const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos enviados"));

    await caseFile.expectStep("queued");
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
    await caseFile.expectStep("queued");
    expect(sentParts).toEqual(["1", "2"]);
  });
});
