import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoTextNotice, UnreadPages } from "./unread-pages";

afterEach(cleanup);

describe("UnreadPages", () => {
  it("lists the scanned pages that were not read", () => {
    render(
      <UnreadPages
        ranges={[
          { first: 3, last: 4 },
          { first: 9, last: 9 },
          { first: 1200, last: 1210 },
        ]}
        count={14}
      />,
    );

    expect(screen.getByRole("note").textContent).toContain("14 páginas digitalizadas não foram lidas");
    expect(screen.getByText("p. 3–4, 9 e 1.200–1.210")).toBeTruthy();
  });

  it("names one page in the singular", () => {
    render(<UnreadPages ranges={[{ first: 7, last: 7 }]} count={1} />);

    expect(screen.getByRole("note").textContent).toContain("1 página digitalizada não foi lida: p. 7.");
  });

  it("shows nothing when every page was read", () => {
    render(<UnreadPages ranges={[]} count={0} />);

    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("NoTextNotice", () => {
  it("says the PDF has no text and that reading scanned pages comes in a future version", () => {
    render(<NoTextNotice />);

    const note = screen.getByRole("note").textContent;
    expect(note).toContain("Este PDF não tem texto: as páginas são imagens digitalizadas sem OCR.");
    expect(note).toContain("a leitura de páginas digitalizadas estará disponível em uma próxima versão");
  });
});
