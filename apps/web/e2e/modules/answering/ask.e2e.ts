import { expect, test, uniqueName } from "../../support/fixtures";

// Needs real answers and a document map: Answering arrives with ticket 07, the document map with 09.
test.fixme();

test.beforeEach(async ({ caseFileList, caseFile }) => {
  await caseFileList.goto();
  await caseFileList.uploadAndOpen(uniqueName("Autos para perguntas"));
  await expect(caseFile.documentMap).toBeVisible({ timeout: 60_000 });
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
