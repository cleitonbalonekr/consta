"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishUpload, signUploadPart, startUpload } from "@/app/actions";
import { formatNumber } from "@/lib/format";
import { countPages } from "@/lib/pdf";

const PART_BYTES = 10 * 1024 * 1024;

type UploadState =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "sending"; percent: number }
  | { step: "quota-exceeded"; pagesNeeded: number; pagesLeft: number }
  | { step: "error"; message: string };

/** Picks a PDF, counts its pages, sends it in parts and opens the new case file. */
export function UploadCaseFile() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ step: "idle" });
  const busy = state.step === "reading" || state.step === "sending";

  async function upload(file: File) {
    try {
      await send(file);
    } catch {
      setState({ step: "error", message: "O envio foi interrompido. Tente de novo." });
    }
  }

  async function send(file: File) {
    setState({ step: "reading" });
    const pages = await countPages(file).catch(() => null);
    if (pages === null) {
      setState({ step: "error", message: "Não conseguimos abrir este arquivo. Confira se é um PDF." });
      return;
    }

    const started = await startUpload({ name: file.name, bytes: file.size, pages });
    if (!started.ok) {
      setState({ step: "quota-exceeded", pagesNeeded: started.pagesNeeded, pagesLeft: started.pagesLeft });
      return;
    }

    const partCount = Math.max(1, Math.ceil(file.size / PART_BYTES));
    for (let part = 1; part <= partCount; part++) {
      setState({ step: "sending", percent: Math.round((100 * (part - 1)) / partCount) });
      const url = await signUploadPart(started.caseFileId, part);
      const response = await fetch(url, { method: "PUT", body: file.slice((part - 1) * PART_BYTES, part * PART_BYTES) });
      if (!response.ok) throw new Error(`Part ${part} failed with ${response.status}.`);
    }
    await finishUpload(started.caseFileId);
    router.push(`/autos/${started.caseFileId}`);
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <label
        htmlFor="upload-input"
        aria-disabled={busy}
        className={`cursor-pointer rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-900 ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {state.step === "reading" ? "Contando as páginas…" : state.step === "sending" ? `Enviando… ${state.percent}%` : "Enviar autos (PDF)"}
      </label>
      <input
        id="upload-input"
        type="file"
        accept="application/pdf"
        className="sr-only"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {state.step === "quota-exceeded" && (
        <div id="quota-exceeded" role="alert" className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-left">
          <p className="font-semibold text-amber-950">Sua cota de páginas não cobre estes autos</p>
          <p className="mt-1 text-sm text-amber-900">
            Estes autos têm {formatNumber(state.pagesNeeded)} páginas e restam {formatNumber(state.pagesLeft)} páginas na sua cota deste mês. Nada
            foi enviado.
          </p>
          <button id="quota-exceeded-dismiss" type="button" onClick={() => setState({ step: "idle" })} className="mt-3 text-sm font-medium text-amber-950 underline">
            Entendi
          </button>
        </div>
      )}
      {state.step === "error" && (
        <p id="upload-error" role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}
