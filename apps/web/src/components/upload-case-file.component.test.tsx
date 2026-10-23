import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishUpload, signUploadPart, startUpload, upgradeToPro, uploadedParts } from "@/app/actions";
import { countPages } from "@/lib/pdf";
import { UploadCaseFile } from "./upload-case-file";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/pdf", () => ({ countPages: vi.fn() }));
vi.mock("@/app/actions", () => ({
  startUpload: vi.fn(),
  signUploadPart: vi.fn(),
  uploadedParts: vi.fn(),
  finishUpload: vi.fn(),
  upgradeToPro: vi.fn(),
}));

const PART_BYTES = 10 * 1024 * 1024;

/** A file of three parts. Only its size matters: pdf.js is mocked. */
const threeParts = () => new File([new Uint8Array(2 * PART_BYTES + 10)], "Autos.pdf", { type: "application/pdf" });

/** The part number of each PUT that reached storage. */
let putParts: number[];

beforeEach(() => {
  putParts = [];
  vi.mocked(countPages).mockResolvedValue(10);
  vi.mocked(startUpload).mockResolvedValue({ ok: true, caseFileId: "case-file-1" });
  vi.mocked(signUploadPart).mockImplementation(async (_id, part) => `https://storage.test/part/${part}`);
  vi.mocked(finishUpload).mockResolvedValue({ ok: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      putParts.push(Number(url.split("/").at(-1)));
      return new Response(null, { status: 200 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function pick(file: File, pro: { pageQuota: number } | null = null) {
  render(<UploadCaseFile pro={pro} />);
  await userEvent.upload(screen.getByLabelText(/Arraste o PDF/), file);
}

describe("UploadCaseFile", () => {
  it("sends every part, finishes the upload and opens the case file", async () => {
    await pick(threeParts());

    expect(startUpload).toHaveBeenCalledWith({ name: "Autos.pdf", bytes: 2 * PART_BYTES + 10, pages: 10 });
    expect(putParts).toEqual([1, 2, 3]);
    expect(finishUpload).toHaveBeenCalledWith("case-file-1");
    expect(push).toHaveBeenCalledWith("/autos/case-file-1");
  });

  it("refuses a case file over the quota without sending any part", async () => {
    vi.mocked(startUpload).mockResolvedValue({ ok: false, reason: "quota-exceeded", pagesNeeded: 600, pagesLeft: 500 });

    await pick(threeParts());

    expect(screen.getByRole("alert").textContent).toContain("Estes autos têm 600 páginas e restam 500 páginas");
    expect(screen.getByRole("alert").textContent).toContain("Nada foi enviado.");
    expect(putParts).toEqual([]);
  });

  it("offers a lawyer on Trial to pay for Pro when the quota can't cover the case file", async () => {
    vi.mocked(startUpload).mockResolvedValue({ ok: false, reason: "quota-exceeded", pagesNeeded: 600, pagesLeft: 500 });
    await pick(threeParts(), { pageQuota: 5_000 });

    expect(screen.getByRole("alert").textContent).toContain("O plano Pro cobre 5.000 páginas por mês.");
    await userEvent.click(screen.getByRole("button", { name: "Assinar o Pro" }));

    expect(upgradeToPro).toHaveBeenCalled();
  });

  it("offers no upgrade to a lawyer who can't upgrade", async () => {
    vi.mocked(startUpload).mockResolvedValue({ ok: false, reason: "quota-exceeded", pagesNeeded: 6_000, pagesLeft: 500 });

    await pick(threeParts(), null);

    expect(screen.queryByRole("button", { name: "Assinar o Pro" })).toBeNull();
  });

  it("explains the page limit and the size limit", async () => {
    vi.mocked(startUpload).mockResolvedValueOnce({ ok: false, reason: "too-many-pages" });
    await pick(threeParts());
    expect(screen.getByRole("alert").textContent).toContain("mais de 5.000 páginas");
    cleanup();

    vi.mocked(startUpload).mockResolvedValueOnce({ ok: false, reason: "too-large" });
    await pick(threeParts());
    expect(screen.getByRole("alert").textContent).toContain("mais de 500 MB");
  });

  it("says the stored PDF was refused when the recount exceeds the quota", async () => {
    vi.mocked(finishUpload).mockResolvedValue({ ok: false, reason: "quota-exceeded", pagesNeeded: 520, pagesLeft: 500 });

    await pick(threeParts());

    expect(screen.getByRole("alert").textContent).toContain("O arquivo não entrou na fila de leitura.");
    expect(push).not.toHaveBeenCalled();
  });

  it("resumes an interrupted upload by sending only the parts not stored", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(null, { status: 200 }));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await pick(threeParts());
    expect(screen.getByRole("alert").textContent).toContain("foi interrompido");
    vi.mocked(uploadedParts).mockResolvedValue([1]);

    await userEvent.click(screen.getByRole("button", { name: "Continuar envio" }));

    expect(uploadedParts).toHaveBeenCalledWith("case-file-1");
    expect(putParts).toEqual([2, 3]);
    expect(push).toHaveBeenCalledWith("/autos/case-file-1");
  });
});
