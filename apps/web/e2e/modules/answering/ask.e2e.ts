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

  test("a citation opens the viewer at its page with its text marked", async ({ caseFile, answer, viewer }) => {
    await caseFile.ask("Quem pede a indenização?");
    await answer.waitUntilDone();

    await answer.citation(0, 0).click();

    await viewer.expectPage(1);
    await expect(viewer.pageNumber).toContainText("fls. 1");
    await viewer.expectMarksOnPage();
  });
});

test.describe("asking about one peça", () => {
  test.beforeEach(async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(uniqueName("Autos para perguntas"), await pdfWithText(3));
    await caseFile.expectReady();
  });

  test("a question about one peça cites only its pages", async ({ caseFile, answer }) => {
    // The fake extractor maps pages 1–2 as the petição inicial and page 3 as the contestação.
    await caseFile.choosePeca(1);

    await caseFile.ask("O que o réu contesta?");

    await answer.waitUntilDone();
    // The fake model cites the first two sources; the contestação has one page, so one statement.
    await expect(answer.statements).toHaveCount(1);
    expect(await answer.citationLabels()).toEqual(["p. 3 · fls. 3"]);
  });

  test("the summary of a peça is cited paragraphs from its pages", async ({ caseFile, answer }) => {
    await caseFile.choosePeca(0);

    await caseFile.summarizePeca();

    await answer.waitUntilDone();
    await expect(answer.statements).toHaveCount(2);
    for (const statement of await answer.statements.all()) {
      await expect(statement.locator('[id^="citation-"]').first()).toBeVisible();
    }
    expect(await answer.citationLabels()).toEqual(["p. 1 · fls. 1", "p. 2 · fls. 2"]);
  });
});

test("a peça of scanned pages is refused, and an answer names the scanned pages of the peça it did not read", async ({ caseFileList, caseFile, answer }) => {
  await caseFileList.goto();
  // The fake extractor maps pages 1–2 and 3–4 as two peças: the first all scanned, the second half scanned.
  await caseFileList.uploadAndOpen(uniqueName("Autos digitalizados"), await pdfWithText(4, [1, 2, 4]));
  await caseFile.expectReady();

  await caseFile.choosePeca(0);
  await caseFile.summarizePeca();

  await answer.waitUntilRefused();
  await expect(answer.error).toBeVisible();
  await expect(answer.statements).toHaveCount(0);

  await caseFile.choosePeca(1);
  await caseFile.summarizePeca();

  await answer.waitUntilDone();
  expect(await answer.citationLabels()).toEqual(["p. 3 · fls. 3"]);
  await expect(answer.unreadPages).toContainText("p. 4");
});

test.describe("quick actions", () => {
  test.beforeEach(async ({ caseFileList, caseFile }) => {
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(uniqueName("Autos para perguntas"), await pdfWithText(3));
    await caseFile.expectReady();
  });

  for (const action of ["timeline", "people", "amounts"] as const) {
    test(`the ${action} quick action returns a list, each item citing the page of its fact`, async ({ caseFile, answer }) => {
      await caseFile.runQuickAction(action);

      await answer.waitUntilDone();
      // The fake extractor records facts on every page; the fake model cites the first two and adds an uncited line.
      await expect(answer.statements).toHaveCount(2);
      for (const statement of await answer.statements.all()) {
        await expect(statement.locator('[id^="citation-"]').first()).toBeVisible();
      }
      for (const label of await answer.citationLabels()) expect(label).toMatch(/^p\. [1-3] · fls\. [1-3]$/);
    });
  }
});

test.describe("the viewer", () => {
  test("reads only the byte ranges of the pages it shows, and moves between pages", async ({ caseFileList, caseFile, answer, viewer }) => {
    // Past twice pdf.js's 64 KB chunk, the size from which it reads ranges instead of the whole file.
    const pdf = await pdfWithText(3, [], { attachmentBytes: 1024 * 1024 });
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(uniqueName("Autos grandes"), pdf);
    await caseFile.expectReady();
    const reads = viewer.recordRangeReads();
    await caseFile.ask("Quem pede a indenização?");
    await answer.waitUntilDone();

    await answer.citation(0, 0).click();
    await viewer.expectPage(1);

    await viewer.nextPage.click();
    await viewer.expectPage(2);

    // The embedded file is on no page, so a viewer that loads pages on demand never reads most of the PDF.
    expect(reads.ranges).toBeGreaterThan(0);
    expect(reads.bytes).toBeLessThan(pdf.length / 2);
    await expect(viewer.pageNumber).toContainText("fls. 2");
    await expect(viewer.marks).toHaveCount(0);
  });

  test("shows a scanned page whose image is JPEG 2000", async ({ caseFileList, caseFile, answer, viewer }) => {
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(uniqueName("Autos digitalizados"), await pdfWithText(2, [], { ocrScans: [1] }));
    await caseFile.expectReady();
    await caseFile.ask("Quem pede a indenização?");
    await answer.waitUntilDone();

    await answer.citation(0, 0).click();
    await viewer.expectPage(1);

    await viewer.expectScanDrawn();
  });
});
