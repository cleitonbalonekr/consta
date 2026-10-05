import { SignInPage } from "../auth/pages/sign-in.page";
import { SAMPLE_CASE_FILE_ID } from "../../support/sample-pdf";
import { expect, test, uniqueEmail, uniqueName } from "../../support/fixtures";
import { CaseFileListPage } from "./pages/case-file-list.page";

test("two lawyers don't see each other's case files", async ({ caseFileList, browser, baseURL }) => {
  await caseFileList.goto();
  const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos da primeira advogada"));

  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  await new SignInPage(other).signIn(uniqueEmail("segunda"));
  const otherList = new CaseFileListPage(other);

  // The second lawyer has only their own copy of the sample case file.
  await expect(otherList.row(SAMPLE_CASE_FILE_ID)).toBeVisible();
  await expect(otherList.rows).toHaveCount(1);
  const opened = await other.goto(`/autos/${caseFileId}`);
  expect(opened?.status()).toBe(404);

  await otherContext.close();
});
