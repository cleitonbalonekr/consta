import { test as base } from "@playwright/test";
import { SignInPage } from "../modules/auth/pages/sign-in.page";
import { CaseFileListPage } from "../modules/case-files/pages/case-file-list.page";
import { CaseFilePage } from "../modules/case-files/pages/case-file.page";
import { AnswerComponent } from "./components/answer.component";
import { HeaderComponent } from "./components/header.component";
import { ViewerComponent } from "./components/viewer.component";

type Fixtures = {
  signIn: SignInPage;
  header: HeaderComponent;
  caseFileList: CaseFileListPage;
  caseFile: CaseFilePage;
  answer: AnswerComponent;
  viewer: ViewerComponent;
  /** Whether the journey starts signed in. Journeys about signing in turn it off. */
  signedIn: boolean;
  /** The email of the new lawyer each journey signs in as, or null when signed out. */
  lawyerEmail: string | null;
};

export const test = base.extend<Fixtures>({
  signIn: async ({ page }, use) => use(new SignInPage(page)),
  header: async ({ page }, use) => use(new HeaderComponent(page)),
  caseFileList: async ({ page }, use) => use(new CaseFileListPage(page)),
  caseFile: async ({ page }, use) => use(new CaseFilePage(page)),
  answer: async ({ page }, use) => use(new AnswerComponent(page)),
  viewer: async ({ page }, use) => use(new ViewerComponent(page)),
  signedIn: [true, { option: true }],
  lawyerEmail: [
    async ({ signIn, signedIn }, use) => {
      if (!signedIn) return use(null);
      const email = uniqueEmail("advogada");
      await signIn.signIn(email);
      await use(email);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

/** A file name no other journey uses, since journeys share one server and database. */
export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}.pdf`;
}

/** An email no other journey uses, so each journey signs in as a new lawyer. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}
