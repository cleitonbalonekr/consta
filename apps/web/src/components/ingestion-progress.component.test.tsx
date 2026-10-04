import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IngestionProgress } from "./ingestion-progress";

afterEach(cleanup);

describe("IngestionProgress", () => {
  it("shows page N of M while pages are read", () => {
    render(<IngestionProgress status="processing" pagesDone={120} pageCount={3600} error={null} />);

    expect(screen.getByText("Lendo as páginas")).toBeTruthy();
    expect(screen.getByText("120 de 3.600 páginas lidas")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("120");
  });

  it.each([
    ["uploading", "Enviando o arquivo"],
    ["queued", "Na fila para leitura"],
    ["mapping", "Montando o mapa dos autos"],
  ] as const)("names the %s step", (status, label) => {
    render(<IngestionProgress status={status} pagesDone={0} pageCount={10} error={null} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("shows why ingestion failed", () => {
    render(<IngestionProgress status="failed" pagesDone={3} pageCount={8} error="Não foi possível ler a página 4." />);

    expect(screen.getByText("Não foi possível ler estes autos")).toBeTruthy();
    expect(screen.getByText("Não foi possível ler a página 4.")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
