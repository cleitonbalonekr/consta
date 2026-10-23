import { CostsPage } from "./pages/costs.page";
import { SignInPage } from "../auth/pages/sign-in.page";
import { OPERATOR_EMAIL } from "../../support/operator";
import { expect, test, uniqueName } from "../../support/fixtures";

test.describe("the operator's cost page", () => {
  test("shows the operator this month's costs of a lawyer and of their case file", async ({ browser, caseFileList, caseFile, lawyerEmail }) => {
    const name = uniqueName("Autos com custo");
    await caseFileList.goto();
    await caseFileList.uploadAndOpen(name);
    await caseFile.expectReady();

    const operator = await browser.newContext();
    const operatorPage = await operator.newPage();
    await new SignInPage(operatorPage).signIn(OPERATOR_EMAIL);
    const costs = new CostsPage(operatorPage);
    await costs.goto();

    await expect(costs.lawyerRow(lawyerEmail!)).toBeVisible();
    await expect(costs.caseFileRow(name)).toBeVisible();
    await operator.close();
  });

  test("is refused to a lawyer who isn't an operator", async ({ costs }) => {
    const response = await costs.goto();

    expect(response?.status()).toBe(404);
    await expect(costs.report).toHaveCount(0);
  });
});
