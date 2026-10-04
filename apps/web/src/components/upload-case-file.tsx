"use client";

import { CloudUpload, LoaderCircle, TriangleAlert } from "lucide-react";
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

/** Picks or drops a PDF, counts its pages, sends it in parts and opens the new case file. */
export function UploadCaseFile() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
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
    setState({ step: "sending", percent: 100 });
    await finishUpload(started.caseFileId);
    router.push(`/autos/${started.caseFileId}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor="upload-input"
        aria-disabled={busy}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !busy) void upload(file);
        }}
        className={`group relative flex cursor-pointer flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed px-6 py-10 text-center transition-all ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:border-accent hover:bg-surface-raised"
        } ${busy ? "pointer-events-none" : ""}`}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text transition-transform group-hover:-translate-y-0.5">
          {busy ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <CloudUpload className="size-6" aria-hidden />}
        </span>
        {state.step === "reading" ? (
          <UploadMessage title="Contando as páginas…" detail="Lemos o arquivo aqui mesmo, antes de enviar." />
        ) : state.step === "sending" ? (
          <div className="w-full max-w-xs">
            <UploadMessage title={`Enviando… ${state.percent}%`} detail="Não feche esta página até o envio terminar." />
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${state.percent}%` }} />
            </div>
          </div>
        ) : (
          <UploadMessage
            title={dragging ? "Solte para enviar" : "Arraste o PDF dos autos para cá"}
            detail={
              <>
                ou <span className="font-medium text-accent-text">clique para escolher</span> · o PDF completo, como baixado do PJe ou e-SAJ
              </>
            }
          />
        )}
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
        <div id="quota-exceeded" role="alert" className="flex animate-rise gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold text-foreground">Sua cota de páginas não cobre estes autos</p>
            <p className="mt-1 text-sm text-muted">
              Estes autos têm {formatNumber(state.pagesNeeded)} páginas e restam {formatNumber(state.pagesLeft)} páginas na sua cota deste mês.
              Nada foi enviado.
            </p>
            <button
              id="quota-exceeded-dismiss"
              type="button"
              onClick={() => setState({ step: "idle" })}
              className="mt-3 text-sm font-medium text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
      {state.step === "error" && (
        <p id="upload-error" role="alert" className="flex items-center gap-2 text-sm text-danger">
          <TriangleAlert className="size-4" aria-hidden />
          {state.message}
        </p>
      )}
    </div>
  );
}

function UploadMessage({ title, detail }: { title: string; detail: React.ReactNode }) {
  return (
    <span className="block">
      <span className="block font-semibold text-foreground">{title}</span>
      <span className="mt-1 block text-sm text-muted">{detail}</span>
    </span>
  );
}
