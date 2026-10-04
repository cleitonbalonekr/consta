import { SAMPLE_CASE_FILE_ID } from "../../support/sample-pdf";
import { expect, test } from "../../support/fixtures";

test("the case file page fits a tablet, and the viewer opens over it", async ({ caseFile, answer, viewer, page }) => {
  await caseFile.goto(SAMPLE_CASE_FILE_ID);

  await expect(caseFile.documentMap).toBeVisible();
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
