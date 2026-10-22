import { PecaId } from "@consta/core";
import type { PecaView } from "@consta/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentMap } from "./document-map";

afterEach(cleanup);

const documentMap: PecaView[] = [
  { id: PecaId("p1"), type: "peticao-inicial", title: "Petição inicial", date: "2026-03-10", firstPage: 1, lastPage: 4, summary: "A autora pede indenização." },
  { id: PecaId("p2"), type: "sentenca", title: "Sentença", date: null, firstPage: 9, lastPage: 9, summary: "Julga procedente." },
];

describe("DocumentMap", () => {
  it("lists each peça with its type, page range, title, date and summary", () => {
    render(<DocumentMap documentMap={documentMap} selectedPecaId={null} onSelect={() => {}} />);

    const [first, second] = screen.getAllByRole("button");
    expect(first!.textContent).toBe("Petição inicialp. 1–4Petição inicial10/03/2026A autora pede indenização.");
    expect(second!.textContent).toBe("Sentençap. 9SentençaJulga procedente.");
  });

  it("hands the peça the lawyer clicks to onSelect", async () => {
    const onSelect = vi.fn();
    render(<DocumentMap documentMap={documentMap} selectedPecaId={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /Sentença/ }));

    expect(onSelect).toHaveBeenCalledWith(documentMap[1]);
  });

  it("says so when the pages read hold no peça", () => {
    render(<DocumentMap documentMap={[]} selectedPecaId={null} onSelect={() => {}} />);

    expect(screen.getByText("Não encontramos peças nas páginas lidas.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
