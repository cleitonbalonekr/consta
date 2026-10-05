import { SAMPLE_CASE_FILE_ID } from "../../support/sample-pdf";
import { expect, test, uniqueEmail } from "../../support/fixtures";

test.describe("signed out", () => {
  test.use({ signedIn: false });

  test("signing in through the logged link lands on the lawyer's case files", async ({ signIn, header, caseFileList, page }) => {
    const email = uniqueEmail("ana");
    await signIn.goto();

    await signIn.requestLink(email);
    await signIn.openLoggedLink(email);

    await expect(page).toHaveURL("/");
    await expect(caseFileList.row(SAMPLE_CASE_FILE_ID)).toBeVisible();
    await expect(header.signedInEmail).toHaveText(email);
  });

  test("every app route sends a signed-out visitor to sign-in", async ({ page }) => {
    for (const path of ["/", `/autos/${SAMPLE_CASE_FILE_ID}`]) {
      await page.goto(path);
      await expect(page).toHaveURL("/entrar");
    }
    const question = await page.request.post(`/api/case-files/${SAMPLE_CASE_FILE_ID}/questions`, {
      data: { scope: { kind: "whole-file" }, text: "Do que trata a ação?" },
      maxRedirects: 0,
    });
    expect(question.status()).toBe(307);
    expect(question.headers().location).toMatch(/\/entrar$/);
  });
});

test.describe("signed in", () => {
  test("visiting sign-in goes to the case file list", async ({ signIn, page }) => {
    await signIn.goto();

    await expect(page).toHaveURL("/");
  });

  test("signing out returns to sign-in and protects the app again", async ({ header, page }) => {
    await header.signOut();

    await page.goto("/");
    await expect(page).toHaveURL("/entrar");
  });
});
