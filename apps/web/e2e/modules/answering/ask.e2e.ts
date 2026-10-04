import { SAMPLE_CASE_FILE_ID } from "../../support/sample-pdf";
import { expect, test } from "../../support/fixtures";

test.beforeEach(async ({ caseFile }) => {
  await caseFile.goto(SAMPLE_CASE_FILE_ID);
});

test("asking about the whole case file streams cited statements, and a citation opens the viewer at its page", async ({
  caseFile,
  answer,
  viewer,
}) => {
  await caseFile.ask("Do que trata esta ação?");

  // The first statement shows while the rest are still on their way.
  await expect(answer.statements.first()).toBeVisible();
  await expect(answer.root).toHaveAttribute("data-state", "streaming");
  await answer.waitUntilDone();
  // The script has five statements; the uncited one never reaches the screen.
  await expect(answer.statements).toHaveCount(4);
  expect(await answer.citationLabels()).toContain("p. 2 · fls. 2");

  await answer.citation(0, 0).click();

  await viewer.expectPage(2);
  await expect(viewer.pageNumber).toContainText("fls. 2");
  await expect(viewer.marks).toHaveCount(2);
  await viewer.expectMarksOnPage();
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
