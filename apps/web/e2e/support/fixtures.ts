import { test as base } from "@playwright/test";
import { CaseFileListPage } from "../modules/case-files/pages/case-file-list.page";
import { CaseFilePage } from "../modules/case-files/pages/case-file.page";
import { AnswerComponent } from "./components/answer.component";
import { ViewerComponent } from "./components/viewer.component";

type Fixtures = {
  caseFileList: CaseFileListPage;
  caseFile: CaseFilePage;
  answer: AnswerComponent;
  viewer: ViewerComponent;
};

export const test = base.extend<Fixtures>({
  caseFileList: async ({ page }, use) => use(new CaseFileListPage(page)),
  caseFile: async ({ page }, use) => use(new CaseFilePage(page)),
  answer: async ({ page }, use) => use(new AnswerComponent(page)),
  viewer: async ({ page }, use) => use(new ViewerComponent(page)),
});

export { expect } from "@playwright/test";

/** A file name no other journey uses, since journeys share one demo server. */
export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}.pdf`;
}
