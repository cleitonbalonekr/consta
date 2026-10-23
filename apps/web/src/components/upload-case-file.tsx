"use client";

import { CloudUpload, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UploadRefusal } from "@/app/actions";
import { finishUpload, signUploadPart, startUpload, upgradeToPro, uploadedParts } from "@/app/actions";
import { formatNumber } from "@/lib/format";
import { countPages } from "@/lib/pdf";

const PART_BYTES = 10 * 1024 * 1024;

type UploadState =
  | { step: "idle" }
  | { step: "reading" }
  | { step: "sending"; percent: number }
  /** The connection dropped mid-upload; the parts already stored stay, so the upload can resume. */
  | { step: "interrupted"; file: File; caseFileId: string }
  /** `sent` is true when the stored PDF was refused after the upload, false when nothing was sent. */
  | { step: "quota-exceeded"; pagesNeeded: number; pagesLeft: number; sent: boolean }
  | { step: "error"; message: string };

const REFUSALS = {
  "too-many-pages": "Estes autos têm mais de 5.000 páginas, o limite por arquivo. Nada foi enviado.",
  "too-large": "Este arquivo tem mais de 500 MB, o limite por arquivo. Nada foi enviado.",
};

/**
 * Picks or drops a PDF, counts its pages, sends it in parts and opens the new case file.
 * `pro`: the offer of Pro to a lawyer on Trial, shown when a case file is over the quota; null for anyone else.
 */
export function UploadCaseFile({ pro }: { pro: { pageQuota: number } | null }) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const busy = state.step === "reading" || state.step === "sending";

  function refuse(refusal: UploadRefusal, sent: boolean) {
    if (refusal.reason === "quota-exceeded") {
      setState({ step: "quota-exceeded", pagesNeeded: refusal.pagesNeeded, pagesLeft: refusal.pagesLeft, sent });
    } else {
      setState({ step: "error", message: REFUSALS[refusal.reason] });
    }
  }

  async function upload(file: File) {
    setState({ step: "reading" });
    const pages = await countPages(file).catch(() => null);
    if (pages === null) {
      setState({ step: "error", message: "Não conseguimos abrir este arquivo. Confira se é um PDF." });
      return;
    }

    const started = await startUpload({ name: file.name, bytes: file.size, pages }).catch(() => null);
    if (!started) {
      setState({ step: "error", message: "O envio não começou. Confira sua conexão e tente de novo." });
      return;
    }
    if (!started.ok) {
      refuse(started, false);
      return;
    }
    await send(file, started.caseFileId, new Set());
  }

  /** Sends the parts not yet stored, then closes the upload. A dropped connection leaves it to resume. */
  async function send(file: File, caseFileId: string, stored: Set<number>) {
    const partCount = Math.max(1, Math.ceil(file.size / PART_BYTES));
    try {
      for (let part = 1; part <= partCount; part++) {
        setState({ step: "sending", percent: Math.round((100 * (part - 1)) / partCount) });
        if (stored.has(part)) continue;
        const url = await signUploadPart(caseFileId, part);
        const response = await fetch(url, { method: "PUT", body: file.slice((part - 1) * PART_BYTES, part * PART_BYTES) });
        if (!response.ok) throw new Error(`Part ${part} failed with ${response.status}.`);
      }
      setState({ step: "sending", percent: 100 });
      const finished = await finishUpload(caseFileId);
      if (!finished.ok) {
        refuse(finished, true);
        return;
      }
    } catch {
      setState({ step: "interrupted", file, caseFileId });
      return;
    }
    router.push(`/autos/${caseFileId}`);
  }

  async function resume(file: File, caseFileId: string) {
    setState({ step: "sending", percent: 0 });
    const stored = await uploadedParts(caseFileId).catch(() => null);
    if (!stored) {
      setState({ step: "interrupted", file, caseFileId });
      return;
    }
    await send(file, caseFileId, new Set(stored));
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
              {state.sent ? " O arquivo não entrou na fila de leitura." : " Nada foi enviado."}
            </p>
            {pro && <p className="mt-2 text-sm text-muted">O plano Pro cobre {formatNumber(pro.pageQuota)} páginas por mês.</p>}
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {pro && (
                <form action={upgradeToPro}>
                  <button
                    id="upgrade-to-pro"
                    type="submit"
                    className="inline-flex items-center rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
                  >
                    Assinar o Pro
                  </button>
                </form>
              )}
              <button
                id="quota-exceeded-dismiss"
                type="button"
                onClick={() => setState({ step: "idle" })}
                className="text-sm font-medium text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
      {state.step === "interrupted" && (
        <div id="upload-interrupted" role="alert" className="flex animate-rise flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            O envio de <span className="font-medium">{state.file.name}</span> foi interrompido. As partes já enviadas foram guardadas.
          </p>
          <button
            id="resume-upload"
            type="button"
            onClick={() => void resume(state.file, state.caseFileId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            <RotateCw className="size-4" aria-hidden />
            Continuar envio
          </button>
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
