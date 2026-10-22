"use client";

import type { Citation, PecaView, QuickAction, Statement } from "@consta/core";
import { ArrowUp, Banknote, CalendarClock, LoaderCircle, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { decodeAnswerEvents } from "@/lib/answer-stream";
import type { QuestionRequest } from "@/lib/question-request";
import { Answer } from "./answer";
import { DocumentMap, pageRange } from "./document-map";
import { PdfViewer } from "./pdf-viewer";

const QUICK_ACTIONS: Array<{ action: QuickAction; label: string; icon: typeof Users }> = [
  { action: "timeline", label: "Linha do tempo", icon: CalendarClock },
  { action: "people", label: "Pessoas", icon: Users },
  { action: "amounts", label: "Valores", icon: Banknote },
];

const SUGGESTIONS = ["Do que trata esta ação?", "O que a sentença decidiu?", "Quais provas foram produzidas?"];

const REFUSALS = {
  "not-ready": "Estes autos ainda estão sendo lidos. Pergunte de novo quando a leitura terminar.",
  "scope-too-large": "Esta peça é grande demais para uma pergunta só. Escolha uma peça menor.",
  declined: "Não conseguimos responder a esta pergunta. Tente reformulá-la.",
};

type AnswerState = {
  question: string;
  /** What the question was about, as the lawyer reads it. */
  scopeLabel: string;
  statements: Statement[];
  state: "streaming" | "done" | "refused" | "error";
  message?: string;
};

type CaseFileWorkspaceProps = { caseFileId: string; documentMap: PecaView[]; pdfUrl: string };

/** A ready case file: the document map, the conversation, the question composer and the viewer. */
export function CaseFileWorkspace({ caseFileId, documentMap, pdfUrl }: CaseFileWorkspaceProps) {
  const [peca, setPeca] = useState<PecaView | null>(null);
  const [scopedToPeca, setScopedToPeca] = useState(false);
  const [question, setQuestion] = useState("");
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const { answer, ask } = useAnswer(caseFileId);
  const selectedPeca = scopedToPeca ? peca : null;

  function askQuestion(text: string) {
    const trimmed = text.trim();
    if (!trimmed || answer?.state === "streaming") return;
    const scope = selectedPeca ? ({ kind: "peca", pecaId: selectedPeca.id } as const) : ({ kind: "whole-file" } as const);
    const scopeLabel = selectedPeca ? `${selectedPeca.title} · ${pageRange(selectedPeca)}` : "Autos inteiros";
    setQuestion("");
    void ask(trimmed, scopeLabel, { scope, text: trimmed });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface/60 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-baseline justify-between px-4 pt-5">
          <h2 className="text-sm font-semibold text-foreground">Mapa dos autos</h2>
          <span className="text-xs tabular-nums text-subtle">{documentMap.length} peças</span>
        </div>
        <p className="px-4 pt-1 pb-3 text-xs text-subtle">Escolha uma peça para perguntar só sobre ela.</p>
        <div className="max-h-64 overflow-y-auto px-2 pb-4 lg:max-h-none">
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

      <section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex-1 lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
            {answer ? (
              <Conversation answer={answer} openCitation={openCitation} onOpenCitation={setOpenCitation} />
            ) : (
              <EmptyConversation onSuggestion={askQuestion} />
            )}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-line bg-background/85 px-4 py-4 backdrop-blur-xl sm:px-6">
          <form
            className="mx-auto w-full max-w-3xl rounded-2xl border border-line bg-surface p-3 shadow-card transition-shadow focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10"
            onSubmit={(event) => {
              event.preventDefault();
              askQuestion(question);
            }}
          >
            <ScopePicker peca={peca} scopedToPeca={scopedToPeca} onScope={setScopedToPeca} />
            <label htmlFor="question-input" className="sr-only">
              Sua pergunta
            </label>
            <textarea
              id="question-input"
              rows={2}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  askQuestion(question);
                }
              }}
              placeholder={selectedPeca ? `Pergunte sobre “${selectedPeca.title}”…` : "Pergunte sobre os autos inteiros…"}
              className="mt-2 w-full resize-none bg-transparent px-1 py-1 text-[0.95rem] text-foreground placeholder:text-subtle focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_ACTIONS.map(({ action, label, icon: Icon }) => (
                  <button
                    key={action}
                    id={`quick-action-${action}`}
                    type="button"
                    disabled={answer?.state === "streaming"}
                    onClick={() => void ask(label, "Lista completa dos autos", { quickAction: action })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-accent-text disabled:opacity-50"
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <button
                id="ask-button"
                type="submit"
                aria-label="Perguntar"
                title="Perguntar (Enter)"
                disabled={!question.trim() || answer?.state === "streaming"}
                className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground shadow-[0_4px_14px_-6px_var(--accent)] transition-all hover:bg-accent-hover disabled:bg-surface-muted disabled:text-subtle disabled:shadow-none"
              >
                <ArrowUp className="size-4.5" aria-hidden />
              </button>
            </div>
          </form>
        </div>
      </section>

      {openCitation && <ViewerPane pdfUrl={pdfUrl} citation={openCitation} onClose={() => setOpenCitation(null)} />}
    </div>
  );
}

type ScopePickerProps = { peca: PecaView | null; scopedToPeca: boolean; onScope: (scopedToPeca: boolean) => void };

/** The two scopes: the whole case file, or the peça last chosen in the document map. */
function ScopePicker({ peca, scopedToPeca, onScope }: ScopePickerProps) {
  const option = (active: boolean) =>
    `max-w-full truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
      active ? "bg-surface-raised text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground"
    }`;
  return (
    <div role="group" aria-label="Escopo da pergunta" className="inline-flex max-w-full gap-0.5 rounded-xl bg-surface-muted p-0.5">
      <button id="scope-whole-file" type="button" aria-pressed={!scopedToPeca} onClick={() => onScope(false)} className={option(!scopedToPeca)}>
        Autos inteiros
      </button>
      <button id="scope-peca" type="button" aria-pressed={scopedToPeca} disabled={!peca} onClick={() => onScope(true)} className={option(scopedToPeca)}>
        {peca ? `Esta peça: ${peca.title} (${pageRange(peca)})` : "Esta peça: escolha no mapa"}
      </button>
    </div>
  );
}

function EmptyConversation({ onSuggestion }: { onSuggestion: (question: string) => void }) {
  return (
    <div className="flex animate-rise flex-col items-center py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent-text">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">O que você quer saber destes autos?</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        Cada afirmação da resposta traz a página que a sustenta. Clique na página para ver o trecho marcado no PDF.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion}
            id={`suggestion-${index}`}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-foreground shadow-card transition-colors hover:border-accent/50 hover:bg-accent-soft"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

type ConversationProps = { answer: AnswerState; openCitation: Citation | null; onOpenCitation: (citation: Citation) => void };

/** The lawyer's question, then the answer as it streams in. */
function Conversation({ answer, openCitation, onOpenCitation }: ConversationProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex animate-rise flex-col items-end gap-1">
        <span className="text-xs text-subtle">{answer.scopeLabel}</span>
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[0.95rem] text-accent-foreground">{answer.question}</p>
      </div>

      <section id="answer" data-state={answer.state} aria-live="polite" className="flex gap-3">
        <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-fuchsia-500 text-accent-foreground">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <Answer statements={answer.statements} openCitation={openCitation} onOpenCitation={onOpenCitation} />
          {answer.state === "streaming" && <Streaming first={answer.statements.length === 0} />}
          {answer.state === "done" && answer.statements.length === 0 && (
            <p className="text-sm text-muted">Não encontramos nos autos nada que responda a esta pergunta.</p>
          )}
          {answer.state === "done" && answer.statements.length > 0 && (
            <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-subtle">
              <ShieldCheck className="size-3.5 text-success" aria-hidden />
              {answer.statements.length === 1 ? "1 afirmação" : `${answer.statements.length} afirmações`}, cada uma com a página que a sustenta.
            </p>
          )}
          {(answer.state === "refused" || answer.state === "error") && (
            <p id="answer-error" role="alert" className="flex items-start gap-2 text-sm text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {answer.message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Streaming({ first }: { first: boolean }) {
  return (
    <div className={first ? "" : "mt-4"}>
      <div className="flex flex-col gap-2" aria-hidden>
        <span className="skeleton h-3 w-11/12 rounded-full" />
        <span className="skeleton h-3 w-2/3 rounded-full" />
      </div>
      <p id="answer-streaming" className="mt-3 flex items-center gap-2 text-xs text-subtle">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Buscando nas páginas…
      </p>
    </div>
  );
}

/** The viewer beside the conversation on wide screens, over it on narrower ones. */
function ViewerPane({ pdfUrl, citation, onClose }: { pdfUrl: string; citation: Citation; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm xl:hidden" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl border-l border-line shadow-2xl xl:static xl:z-auto xl:w-[38rem] xl:max-w-none xl:shrink-0 xl:shadow-none">
        <PdfViewer pdfUrl={pdfUrl} citation={citation} onClose={onClose} />
      </div>
    </>
  );
}

/** Posts a question and folds the streamed events into the answer shown on screen. */
function useAnswer(caseFileId: string) {
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  async function ask(question: string, scopeLabel: string, request: QuestionRequest) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const update = (change: (answer: AnswerState) => AnswerState) =>
      !controller.signal.aborted && setAnswer((previous) => (previous ? change(previous) : previous));
    setAnswer({ question, scopeLabel, statements: [], state: "streaming" });

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
        if (event.type === "refused") update((previous) => ({ ...previous, statements: [], state: "refused", message: REFUSALS[event.reason] }));
        if (event.type === "done") update((previous) => ({ ...previous, state: "done" }));
      }
    } catch {
      update((previous) => ({ ...previous, state: "error", message: "Não conseguimos responder agora. Tente de novo." }));
    }
  }

  return { answer, ask };
}
