"use client";

import type { Citation, PecaView, QuickAction, Statement } from "@consta/core";
import { useRef, useState } from "react";
import { decodeAnswerEvents } from "@/lib/answer-stream";
import type { QuestionRequest } from "@/lib/question-request";
import { Answer } from "./answer";
import { DocumentMap, pageRange } from "./document-map";
import { PdfViewer } from "./pdf-viewer";

const QUICK_ACTIONS: Array<{ action: QuickAction; label: string }> = [
  { action: "timeline", label: "Linha do tempo" },
  { action: "people", label: "Pessoas" },
  { action: "amounts", label: "Valores" },
];

const REFUSALS = {
  "not-ready": "Estes autos ainda estão sendo lidos. Pergunte de novo quando a leitura terminar.",
  "scope-too-large": "Esta peça é grande demais para uma pergunta só. Escolha uma peça menor.",
};

type AnswerState = {
  title: string;
  statements: Statement[];
  state: "streaming" | "done" | "refused" | "error";
  message?: string;
};

type CaseFileWorkspaceProps = { caseFileId: string; documentMap: PecaView[]; pdfUrl: string };

/** A ready case file: the document map, the question form, the answer and the viewer. */
export function CaseFileWorkspace({ caseFileId, documentMap, pdfUrl }: CaseFileWorkspaceProps) {
  const [peca, setPeca] = useState<PecaView | null>(null);
  const [scopedToPeca, setScopedToPeca] = useState(false);
  const selectedPeca = scopedToPeca ? peca : null;
  const [question, setQuestion] = useState("");
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const { answer, ask } = useAnswer(caseFileId);

  function submitQuestion() {
    const text = question.trim();
    if (!text) return;
    const scope = selectedPeca ? ({ kind: "peca", pecaId: selectedPeca.id } as const) : ({ kind: "whole-file" } as const);
    void ask(text, { scope, text });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="border-b border-zinc-200 bg-zinc-50 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <h2 className="px-4 pt-4 text-sm font-semibold text-zinc-900">Mapa dos autos</h2>
        <p className="px-4 pb-2 text-xs text-zinc-500">Escolha uma peça para perguntar só sobre ela.</p>
        <div className="max-h-72 overflow-y-auto px-2 pb-4 lg:max-h-none">
          <DocumentMap
            documentMap={documentMap}
            selectedPecaId={selectedPeca?.id ?? null}
            onSelect={(chosen) => {
              setPeca(chosen);
              setScopedToPeca(true);
            }}
          />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <ScopePicker peca={peca} scopedToPeca={scopedToPeca} onScope={setScopedToPeca} />
          <label htmlFor="question-input" className="text-sm font-medium text-zinc-800">
            Sua pergunta
          </label>
          <textarea
            id="question-input"
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitQuestion();
              }
            }}
            placeholder={selectedPeca ? `Pergunte sobre a peça "${selectedPeca.title}"` : "Pergunte sobre os autos inteiros"}
            className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Listas completas:</span>
              {QUICK_ACTIONS.map(({ action, label }) => (
                <button
                  key={action}
                  id={`quick-action-${action}`}
                  type="button"
                  onClick={() => void ask(label, { quickAction: action })}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 hover:border-blue-800 hover:text-blue-900"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              id="ask-button"
              type="submit"
              disabled={!question.trim() || answer?.state === "streaming"}
              className="rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-900 disabled:opacity-50"
            >
              Perguntar
            </button>
          </div>
        </form>

        {answer ? (
          <AnswerPanel answer={answer} openCitation={openCitation} onOpenCitation={setOpenCitation} />
        ) : (
          <p className="text-sm text-zinc-500">Cada afirmação da resposta traz a página dos autos que a sustenta. Clique na página para ver o trecho.</p>
        )}
      </main>

      {openCitation && (
        <div className="fixed inset-y-0 right-0 z-20 w-full max-w-xl border-l border-zinc-200 shadow-2xl xl:static xl:z-auto xl:w-[36rem] xl:max-w-none xl:shrink-0 xl:shadow-none">
          <PdfViewer pdfUrl={pdfUrl} citation={openCitation} onClose={() => setOpenCitation(null)} />
        </div>
      )}
    </div>
  );
}

type ScopePickerProps = { peca: PecaView | null; scopedToPeca: boolean; onScope: (scopedToPeca: boolean) => void };

/** The two scopes: the whole case file, or the peça last chosen in the document map. */
function ScopePicker({ peca, scopedToPeca, onScope }: ScopePickerProps) {
  const option = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`;
  return (
    <div role="group" aria-label="Escopo da pergunta" className="inline-flex w-fit flex-wrap gap-1 rounded-lg bg-zinc-100 p-1">
      <button id="scope-whole-file" type="button" aria-pressed={!scopedToPeca} onClick={() => onScope(false)} className={option(!scopedToPeca)}>
        Autos inteiros
      </button>
      <button id="scope-peca" type="button" aria-pressed={scopedToPeca} disabled={!peca} onClick={() => onScope(true)} className={option(scopedToPeca)}>
        {peca ? `Esta peça: ${peca.title} (${pageRange(peca)})` : "Esta peça: escolha no mapa"}
      </button>
    </div>
  );
}

type AnswerPanelProps = { answer: AnswerState; openCitation: Citation | null; onOpenCitation: (citation: Citation) => void };

function AnswerPanel({ answer, openCitation, onOpenCitation }: AnswerPanelProps) {
  return (
    <section id="answer" data-state={answer.state} aria-live="polite" className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-zinc-500">{answer.title}</h2>
      <Answer statements={answer.statements} openCitation={openCitation} onOpenCitation={onOpenCitation} />
      {answer.state === "streaming" && (
        <p id="answer-streaming" className="mt-3 text-sm text-zinc-500">
          Buscando nas páginas…
        </p>
      )}
      {answer.state === "done" && answer.statements.length === 0 && (
        <p className="text-sm text-zinc-600">Não encontramos nos autos nada que responda a esta pergunta.</p>
      )}
      {(answer.state === "refused" || answer.state === "error") && (
        <p id="answer-error" role="alert" className="text-sm text-red-700">
          {answer.message}
        </p>
      )}
    </section>
  );
}

/** Posts a question and folds the streamed events into the answer shown on screen. */
function useAnswer(caseFileId: string) {
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const current = useRef<AbortController | null>(null);

  async function ask(title: string, request: QuestionRequest) {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const update = (change: (answer: AnswerState) => AnswerState) =>
      !controller.signal.aborted && setAnswer((previous) => (previous ? change(previous) : previous));
    setAnswer({ title, statements: [], state: "streaming" });

    try {
      const response = await fetch(`/api/case-files/${caseFileId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`Question failed with ${response.status}.`);

      for await (const event of decodeAnswerEvents(response.body)) {
        if (event.type === "statement") update((previous) => ({ ...previous, statements: [...previous.statements, event.statement] }));
        if (event.type === "refused") update((previous) => ({ ...previous, state: "refused", message: REFUSALS[event.reason] }));
        if (event.type === "done") update((previous) => ({ ...previous, state: "done" }));
      }
    } catch {
      update((previous) => ({ ...previous, state: "error", message: "Não conseguimos responder agora. Tente de novo." }));
    }
  }

  return { answer, ask };
}
