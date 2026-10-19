import { expect, test, uniqueEmail } from "../../support/fixtures";

/** Any case file id: signed-out visitors never learn whether it exists. */
const SOME_CASE_FILE_ID = "6f1c2a52-8a3e-4c41-9f0e-2d7b5a1c9e40";

test.describe("signed out", () => {
  test.use({ signedIn: false });

  test("signing in through the logged link lands on the lawyer's case files", async ({ signIn, header, caseFileList, page }) => {
    const email = uniqueEmail("ana");
    await signIn.goto();

    await signIn.requestLink(email);
    await signIn.openLoggedLink(email);

    await expect(page).toHaveURL("/");
    await expect(caseFileList.emptyList).toBeVisible();
    await expect(header.signedInEmail).toHaveText(email);
  });

  test("every app route sends a signed-out visitor to sign-in", async ({ page }) => {
    for (const path of ["/", `/autos/${SOME_CASE_FILE_ID}`]) {
      await page.goto(path);
      await expect(page).toHaveURL("/entrar");
    }
    const question = await page.request.post(`/api/case-files/${SOME_CASE_FILE_ID}/questions`, {
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
