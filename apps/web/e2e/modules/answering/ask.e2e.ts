import { expect, test, uniqueName } from "../../support/fixtures";
import { pdfWithText } from "../../support/sample-pdf";

test.describe("asking about the whole case file", () => {
  test.beforeEach(async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(uniqueName("Autos para perguntas"), await pdfWithText(3));
    await caseFile.expectReady();
  });

  test("streams cited statements and never shows the uncited one", async ({ caseFile, answer }) => {
    await caseFile.ask("Quem pede a indenização?");

    await answer.waitUntilDone();
    // The fake model cites the first two passages and adds one uncited line, which Answering drops.
    await expect(answer.statements).toHaveCount(2);
    for (const statement of await answer.statements.all()) {
      await expect(statement.locator('[id^="citation-"]').first()).toBeVisible();
    }
    for (const label of await answer.citationLabels()) expect(label).toMatch(/^p\. [1-3] · fls\. [1-3]$/);
  });

  // Needs the viewer: ticket 08.
  test.fixme("a citation opens the viewer at its page with its text marked", async ({ caseFile, answer, viewer }) => {
    await caseFile.ask("Quem pede a indenização?");
    await answer.waitUntilDone();

    await answer.citation(0, 0).click();

    await viewer.expectPage(1);
    await expect(viewer.pageNumber).toContainText("fls. 1");
    await viewer.expectMarksOnPage();
  });
});

test.describe("asking about one peça, and quick actions", () => {
  // Needs a document map: ticket 09, then tickets 10 and 11.
  test.fixme();

  test.beforeEach(async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(uniqueName("Autos para perguntas"));
    await expect(caseFile.documentMap).toBeVisible({ timeout: 60_000 });
  });

  test("asking about one peça cites only its pages", async ({ caseFile, answer }) => {
    await caseFile.choosePeca("sample-sentenca");

    await caseFile.ask("Qual foi a condenação?");

    await answer.waitUntilDone();
    const labels = await answer.citationLabels();
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).toMatch(/^p\. (9|10) /);
  });

  for (const action of ["timeline", "people", "amounts"] as const) {
    test(`the ${action} quick action returns a cited list`, async ({ caseFile, answer }) => {
      await caseFile.runQuickAction(action);

      await answer.waitUntilDone();
      expect(await answer.statements.count()).toBeGreaterThan(2);
      for (const statement of await answer.statements.all()) {
        await expect(statement.locator('[id^="citation-"]').first()).toBeVisible();
      }
    });
  }
});
