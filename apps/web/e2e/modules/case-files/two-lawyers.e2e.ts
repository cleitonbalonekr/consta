import { SignInPage } from "../auth/pages/sign-in.page";
import { expect, test, uniqueEmail, uniqueName } from "../../support/fixtures";
import { CaseFileListPage } from "./pages/case-file-list.page";

test("two lawyers don't see each other's case files", async ({ caseFileList, browser, baseURL }) => {
  await caseFileList.goto();
  const caseFileId = await caseFileList.uploadAndOpen(uniqueName("Autos da primeira advogada"));

  const otherContext = await browser.newContext({ baseURL });
  const other = await otherContext.newPage();
  await new SignInPage(other).signIn(uniqueEmail("segunda"));
  const otherList = new CaseFileListPage(other);

  await expect(otherList.emptyList).toBeVisible();
  await expect(otherList.rows).toHaveCount(0);
  const opened = await other.goto(`/autos/${caseFileId}`);
  expect(opened?.status()).toBe(404);

  await otherContext.close();
});
