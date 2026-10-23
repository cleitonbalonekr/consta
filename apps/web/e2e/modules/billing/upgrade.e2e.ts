import { expect, test, uniqueName } from "../../support/fixtures";
import { pdfWithPages } from "../../support/sample-pdf";
import { mockStripeCheckout, STRIPE_CHECKOUT } from "../../support/stripe-checkout";

test.describe("paying for Pro", () => {
  test("reaches Stripe Checkout from the quota-exceeded screen", async ({ caseFileList, page }) => {
    await mockStripeCheckout(page);
    await caseFileList.goto();
    // The Trial quota is 500 pages.
    await caseFileList.upload(uniqueName("Autos grandes demais"), await pdfWithPages(501));
    await expect(caseFileList.quotaExceeded).toBeVisible();

    await caseFileList.upgradeToPro();

    await expect(page).toHaveURL(STRIPE_CHECKOUT);
  });

  test("shows a new lawyer's Trial and reaches Stripe Checkout from the plan page", async ({ plan, page }) => {
    await mockStripeCheckout(page);
    await plan.goto();
    await expect(plan.planName).toHaveText("Trial");
    await expect(plan.pagesLeft).toHaveText("500 de 500 páginas restantes neste mês");

    await plan.upgradeToPro();

    await expect(page).toHaveURL(STRIPE_CHECKOUT);
  });
});
