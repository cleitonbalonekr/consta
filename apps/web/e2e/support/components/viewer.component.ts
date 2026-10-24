import { expect } from "@playwright/test";
import { BasePage } from "../base.page";

/** The case file viewer that a citation opens. */
export class ViewerComponent extends BasePage {
  get root() {
    return this.byId("viewer");
  }

  get pageNumber() {
    return this.byId("viewer-page-number");
  }

  get nextPage() {
    return this.byId("viewer-next-page");
  }

  /** The peça of the document map the viewer was opened at. */
  get openedPeca() {
    return this.byId("viewer-peca");
  }

  get marks() {
    return this.byIdPrefix("viewer-mark-");
  }

  get renderedPage() {
    return this.byId("viewer-page");
  }

  /** From now on, counts the bytes of the stored case file that the browser reads in ranges. */
  recordRangeReads() {
    const reads = { ranges: 0, bytes: 0 };
    this.page.on("response", (response) => {
      if (!new URL(response.url()).pathname.match(/\/case-files\/[^/]+\.pdf$/) || response.status() !== 206) return;
      reads.ranges += 1;
      reads.bytes += Number(response.headers()["content-length"]);
    });
    return reads;
  }

  async expectPage(page: number) {
    await expect(this.root).toHaveAttribute("data-page", String(page));
    await expect(this.renderedPage).toHaveAttribute("data-rendered-page", String(page), { timeout: 10_000 });
  }

  /** Most of the rendered page is drawn on, as a full-page scan draws it; a scan pdf.js failed to decode leaves it white. */
  async expectScanDrawn() {
    const drawn = await this.renderedPage.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      let pixels = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! < 245 || data[i + 1]! < 245 || data[i + 2]! < 245) pixels++;
      return pixels / (data.length / 4);
    });
    expect(drawn).toBeGreaterThan(0.5);
  }

  /** Every mark lies on the rendered page, not just somewhere on screen. */
  async expectMarksOnPage() {
    await expect(this.marks).not.toHaveCount(0);
    const pageBox = (await this.renderedPage.boundingBox())!;
    for (const mark of await this.marks.all()) {
      await expect(mark).toBeVisible();
      const box = (await mark.boundingBox())!;
      expect(box.width).toBeGreaterThan(10);
      expect(box.x).toBeGreaterThanOrEqual(pageBox.x);
      expect(box.y).toBeGreaterThanOrEqual(pageBox.y);
      expect(box.x + box.width).toBeLessThanOrEqual(pageBox.x + pageBox.width);
      expect(box.y + box.height).toBeLessThanOrEqual(pageBox.y + pageBox.height);
    }
  }
}
