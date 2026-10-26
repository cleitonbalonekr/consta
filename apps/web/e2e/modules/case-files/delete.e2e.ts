import { expect, test, uniqueName } from "../../support/fixtures";

test("deleting a case file asks for confirmation, then removes it from the list", async ({ caseFileList, caseFile, page }) => {
  await caseFileList.goto();
  const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos para excluir"));
  // A case file can't be deleted while ingestion reads it.
  await caseFile.expectReady();
  await caseFileList.goto();

  await caseFileList.startDeleting(caseFileId);
  await caseFileList.cancelDeleting(caseFileId);
  await expect(caseFileList.row(caseFileId)).toBeVisible();

  await caseFileList.startDeleting(caseFileId);
  await caseFileList.confirmDeleting(caseFileId);

  await expect(caseFileList.row(caseFileId)).toHaveCount(0);
  await page.reload();
  await expect(caseFileList.row(caseFileId)).toHaveCount(0);
});
