import type { Locator, Page } from "@playwright/test";

/** Base for page objects and components: every control a journey touches is reached by its id. */
export class BasePage {
  constructor(readonly page: Page) {}

  byId(id: string): Locator {
    return this.page.locator(`[id="${id}"]`);
  }

  /** Repeated rows carry a prefixed id, such as `peca-row-<id>`. */
  byIdPrefix(prefix: string): Locator {
    return this.page.locator(`[id^="${prefix}"]`);
  }
}
