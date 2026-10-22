import type { Citation } from "@consta/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfViewer } from "./pdf-viewer";

/** Pages the fake PDF fails to read, as when the signed URL has expired. */
const unreadable = new Set<number>();

/** A three-page PDF whose pages render at once; jsdom has no canvas to draw on. */
vi.mock("@/lib/pdf", () => ({
  openPdf: async () => ({
    numPages: 3,
    loadingTask: { destroy: async () => {} },
    getPage: async (page: number) => {
      if (unreadable.has(page)) throw new Error(`Page ${page} could not be read.`);
      return {
      getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
      };
    },
  }),
}));

afterEach(() => {
  cleanup();
  unreadable.clear();
});

const citation: Citation = {
  page: 2,
  folha: "41",
  quote: "o réu inscreveu o nome da autora",
  boxes: [
    // Fractions that binary floating point holds exactly, so the percentages compare as text.
    { x0: 0.125, y0: 0.25, x1: 0.625, y1: 0.28125 },
    { x0: 0.125, y0: 0.28125, x1: 0.375, y1: 0.3125 },
  ],
};

const folhas = { 1: "40", 2: "41" };

function renderViewer() {
  return render(<PdfViewer pdfUrl="https://files.example/autos.pdf" folhas={folhas} citation={citation} onClose={() => {}} />);
}

/** The page; the tests wait for it, since it appears once the PDF opens. */
function viewerPage() {
  const page = document.getElementById("viewer-page");
  if (!page) throw new Error("The PDF is not open yet.");
  return page;
}

/** Each mark's place on the page, as percentages of the page's width and height. */
async function marks() {
  await waitFor(() => expect(viewerPage().dataset.renderedPage).toBeDefined());
  return [...document.querySelectorAll<HTMLElement>('[id^="viewer-mark-"]')].map(({ style }) => ({
    left: style.left,
    top: style.top,
    width: style.width,
    height: style.height,
  }));
}

const placed = [
  { left: "12.5%", top: "25%", width: "50%", height: "3.125%" },
  { left: "12.5%", top: "28.125%", width: "25%", height: "3.125%" },
];

describe("PdfViewer", () => {
  it("opens at the cited page with every box of the citation marked from its fractions", async () => {
    renderViewer();

    expect(screen.getByLabelText("Abrindo os autos")).toBeTruthy();
    await waitFor(() => expect(viewerPage().dataset.renderedPage).toBe("2"));
    expect(screen.getByText("Página 2")).toBeTruthy();
    expect(await marks()).toEqual(placed);
  });

  it("keeps the marks on the same fractions of the page at every zoom level", async () => {
    renderViewer();
    expect(await marks()).toEqual(placed);
    expect(viewerPage().style.width).toBe("100%");

    await userEvent.click(screen.getByRole("button", { name: "Aumentar o zoom" }));
    await userEvent.click(screen.getByRole("button", { name: "Aumentar o zoom" }));

    expect(document.getElementById("viewer-zoom")!.textContent).toBe("150%");
    expect(viewerPage().style.width).toBe("150%");
    expect(await marks()).toEqual(placed);

    await userEvent.click(screen.getByRole("button", { name: "Diminuir o zoom" }));

    expect(viewerPage().style.width).toBe("125%");
    expect(await marks()).toEqual(placed);
  });

  it("stops zooming out at the width that fits and zooming in at three times it", async () => {
    renderViewer();
    await marks();
    const zoomIn = screen.getByRole<HTMLButtonElement>("button", { name: "Aumentar o zoom" });

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Diminuir o zoom" }).disabled).toBe(true);
    for (let step = 0; step < 4; step++) await userEvent.click(zoomIn);

    expect(viewerPage().style.width).toBe("300%");
    expect(zoomIn.disabled).toBe(true);
  });

  it("moves between pages with the folha beside the page number, and marks only the cited page", async () => {
    renderViewer();
    await waitFor(() => expect(document.getElementById("viewer-page-number")!.textContent).toBe("Página 2 de 3 · fls. 41"));

    await userEvent.click(screen.getByRole("button", { name: "Página anterior" }));

    expect(document.getElementById("viewer-page-number")!.textContent).toBe("Página 1 de 3 · fls. 40");
    await waitFor(() => expect(viewerPage().dataset.renderedPage).toBe("1"));
    expect(await marks()).toEqual([]);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Página anterior" }).disabled).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    // Page 3 has no folha.
    expect(document.getElementById("viewer-page-number")!.textContent).toBe("Página 3 de 3");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Próxima página" }).disabled).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Página anterior" }));

    await waitFor(() => expect(viewerPage().dataset.renderedPage).toBe("2"));
    expect(await marks()).toEqual(placed);
  });

  it("says so when a page can't be read, and shows the next page that can", async () => {
    unreadable.add(1);
    renderViewer();
    await marks();

    await userEvent.click(screen.getByRole("button", { name: "Página anterior" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Não conseguimos abrir esta página");

    await userEvent.click(screen.getByRole("button", { name: "Próxima página" }));

    await waitFor(() => expect(viewerPage().dataset.renderedPage).toBe("2"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
