import type { Statement } from "@consta/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Answer } from "./answer";

afterEach(cleanup);

const box = { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.12 };

const statements: Statement[] = [
  {
    text: "A autora foi inscrita no cadastro de inadimplentes.",
    citations: [
      { page: 2, folha: "2", quote: "o réu inscreveu o nome da autora", boxes: [box] },
      { page: 1, folha: null, quote: "Autora: Maria Aparecida Souza", boxes: [box] },
    ],
  },
  { text: "A sentença julgou o pedido procedente.", citations: [{ page: 10, folha: "34", quote: "JULGO PROCEDENTE", boxes: [box] }] },
];

describe("Answer", () => {
  it("shows each statement with its citations as the page, plus fls. when the page has a folha", () => {
    render(<Answer statements={statements} onOpenCitation={() => {}} />);

    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first!).getByText("A autora foi inscrita no cadastro de inadimplentes.")).toBeTruthy();
    expect(within(first!).getAllByRole("button").map((button) => button.textContent)).toEqual(["p. 2 · fls. 2", "p. 1"]);
    expect(within(second!).getAllByRole("button").map((button) => button.textContent)).toEqual(["p. 10 · fls. 34"]);
  });

  it("opens the citation the lawyer clicks", async () => {
    const onOpenCitation = vi.fn();
    render(<Answer statements={statements} onOpenCitation={onOpenCitation} />);

    await userEvent.click(screen.getByRole("button", { name: /p\. 10/ }));

    expect(onOpenCitation).toHaveBeenCalledWith(statements[1]!.citations[0]);
  });
});
