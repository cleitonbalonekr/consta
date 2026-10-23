import { expect, test, uniqueName } from "../../support/fixtures";
import { pdfWithText } from "../../support/sample-pdf";

test("the document map shows after ingestion, and a peça opens at its first page", async ({ caseFileList, caseFile, viewer }) => {
  await caseFileList.goto();
  await caseFileList.uploadAndOpen(uniqueName("Autos com mapa"), await pdfWithText(3));
  await caseFile.expectReady();

  // The fake extractor maps pages 1–2 as the petição inicial and page 3 as the contestação.
  await expect(caseFile.pecas).toHaveCount(2);
  await expect(caseFile.pecas.nth(1)).toContainText("p. 3");

  await caseFile.pecas.nth(1).click();

  await viewer.expectPage(3);
  await expect(viewer.pageNumber).toContainText("fls. 3");
  await expect(viewer.openedPeca).toContainText("Contestação");
  await expect(viewer.marks).toHaveCount(0);
});
