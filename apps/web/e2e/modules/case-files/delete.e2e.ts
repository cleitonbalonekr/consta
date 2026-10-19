import { expect, test, uniqueName } from "../../support/fixtures";

// CaseFiles.remove arrives with ticket 12.
test.fixme();

test("deleting a case file asks for confirmation, then removes it from the list", async ({ caseFileList, page }) => {
  await caseFileList.goto();
  const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos para excluir"));
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
