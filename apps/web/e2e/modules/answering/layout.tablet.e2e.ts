import { expect, test, uniqueName } from "../../support/fixtures";

// Needs real answers and a document map: Answering arrives with ticket 07, the document map with 09.
test.fixme();

test("the case file page fits a tablet, and the viewer opens over it", async ({ caseFileList, caseFile, answer, viewer, page }) => {
  await caseFileList.goto();
  await caseFileList.uploadAndOpen(uniqueName("Autos no tablet"));

  await expect(caseFile.documentMap).toBeVisible({ timeout: 60_000 });
  await expect(caseFile.byId("question-input")).toBeInViewport();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);

  await caseFile.runQuickAction("amounts");
  await answer.waitUntilDone();
  await answer.citation(0, 0).click();

  await viewer.expectPage(2);
  await expect(viewer.root).toBeInViewport();
  await viewer.expectMarksOnPage();
});
