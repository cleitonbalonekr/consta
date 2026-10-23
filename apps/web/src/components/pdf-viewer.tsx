"use client";

import type { Citation, Folhas, PecaView } from "@consta/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Quote, X, ZoomIn, ZoomOut } from "lucide-react";
import { openPdf } from "@/lib/pdf";
import { citationLabel } from "./answer";
import { pageRange, pecaTypeLabel } from "./document-map";

/** Page widths, as multiples of the width that fits the viewer. */
const ZOOMS = [1, 1.25, 1.5, 2, 3] as const;

/**
 * What the viewer opens: a citation, at its page with its boxes marked there, or a peça of
 * the document map, at its first page.
 */
export type ViewerTarget = { citation: Citation } | { peca: PecaView };

type PdfViewerProps = {
  pdfUrl: string;
  /** The folha of each page that has one, shown beside the page number. */
  folhas: Folhas;
  target: ViewerTarget;
  onClose: () => void;
};

/** Shows one page of the case file at a time, with the cited text marked on the cited page. */
export function PdfViewer({ pdfUrl, folhas, target, onClose }: PdfViewerProps) {
  const pdf = usePdf(pdfUrl);
  const citation = "citation" in target ? target.citation : null;
  const firstPage = "citation" in target ? target.citation.page : target.peca.firstPage;
  const [page, setPage] = useState(firstPage);
  const [zoomStep, setZoomStep] = useState(0);
  const [shownTarget, setShownTarget] = useState(target);
  // Opening another citation or peça moves the viewer to its page.
  if (shownTarget !== target) {
    setShownTarget(target);
    setPage(firstPage);
  }

  const pageCount = pdf && pdf !== "failed" ? pdf.numPages : null;
  const marks = citation && page === citation.page ? citation.boxes : [];
  const folha = folhas[page];
  // zoomStep stays inside ZOOMS: the zoom buttons stop at either end.
  const zoom = ZOOMS[zoomStep]!;

  return (
    <section id="viewer" data-page={page} aria-label="Visualizador dos autos" className="flex h-full flex-col bg-surface-muted">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-1">
          <IconButton id="viewer-previous-page" label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </IconButton>
          <span id="viewer-page-number" className="min-w-32 text-center text-sm tabular-nums text-foreground">
            Página {page}
            {pageCount !== null && <span className="text-subtle">{` de ${pageCount}`}</span>}
            {folha && <span className="text-accent-text">{` · fls. ${folha}`}</span>}
          </span>
          <IconButton
            id="viewer-next-page"
            label="Próxima página"
            disabled={pageCount === null || page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="flex items-center gap-1">
          <ZoomControls step={zoomStep} onStep={setZoomStep} />
          <IconButton id="viewer-close" label="Fechar o visualizador" title="Fechar (Esc)" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
      </header>
      {"citation" in target ? <CitedQuote citation={target.citation} /> : <OpenedPeca peca={target.peca} />}
      <div className="flex-1 overflow-auto p-4">
        {pdf === "failed" ? (
          <p id="viewer-error" role="alert" className="p-4 text-sm text-danger">
            Não conseguimos abrir os autos. Feche e tente de novo.
          </p>
        ) : pdf ? (
          <PdfPage key={page} pdf={pdf} page={page} zoom={zoom} marks={marks} />
        ) : (
          <div className="skeleton mx-auto aspect-[595/842] w-full rounded-sm" aria-label="Abrindo os autos" />
        )}
      </div>
    </section>
  );
}

function CitedQuote({ citation }: { citation: Citation }) {
  return (
    <blockquote id="viewer-quote" className="flex gap-3 border-b border-line bg-surface px-4 py-3">
      <Quote className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
      <span className="text-sm leading-relaxed text-foreground">
        <span className="mr-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.72rem] font-semibold tabular-nums text-accent-text">
          {citationLabel(citation)}
        </span>
        {citation.quote}
      </span>
    </blockquote>
  );
}

function OpenedPeca({ peca }: { peca: PecaView }) {
  return (
    <div id="viewer-peca" className="flex items-baseline gap-2 border-b border-line bg-surface px-4 py-3">
      <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.72rem] font-semibold tabular-nums text-accent-text">
        {`${pecaTypeLabel(peca.type)} · ${pageRange(peca)}`}
      </span>
      <span className="truncate text-sm font-medium text-foreground">{peca.title}</span>
    </div>
  );
}

type IconButtonProps = { id: string; label: string; title?: string; disabled?: boolean; onClick: () => void; children: ReactNode };

function IconButton({ id, label, title, disabled, onClick, children }: IconButtonProps) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Steps through ZOOMS, from the width that fits the viewer to three times it. */
function ZoomControls({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <>
      <IconButton id="viewer-zoom-out" label="Diminuir o zoom" disabled={step === 0} onClick={() => onStep(step - 1)}>
        <ZoomOut className="size-4" aria-hidden />
      </IconButton>
      <span id="viewer-zoom" className="min-w-12 text-center text-xs tabular-nums text-muted">
        {/* step stays inside ZOOMS: the buttons stop at either end. */}
        {`${ZOOMS[step]! * 100}%`}
      </span>
      <IconButton id="viewer-zoom-in" label="Aumentar o zoom" disabled={step === ZOOMS.length - 1} onClick={() => onStep(step + 1)}>
        <ZoomIn className="size-4" aria-hidden />
      </IconButton>
    </>
  );
}

/** The open PDF, null while it loads, or "failed". */
function usePdf(url: string) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | "failed" | null>(null);
  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    openPdf(url).then(
      (document) => {
        if (cancelled) return void document.loadingTask.destroy();
        opened = document;
        setPdf(document);
      },
      () => !cancelled && setPdf("failed"),
    );
    return () => {
      cancelled = true;
      void opened?.loadingTask.destroy();
      setPdf(null);
    };
  }, [url]);
  return pdf;
}

type PdfPageProps = { pdf: PDFDocumentProxy; page: number; zoom: number; marks: Citation["boxes"] };

/** Renders one page at the zoom times the viewer's width, with marks placed from box fractions so they follow any zoom. */
function PdfPage({ pdf, page, zoom, marks }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    // A page is read only when it is shown, so a read can fail long after the PDF opened, as when the URL expires.
    const fail = () => !cancelled && setFailed(true);
    pdf.getPage(page).then((pdfPage) => {
      const element = canvas.current;
      if (cancelled || !element?.parentElement) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = (element.parentElement.clientWidth / base.width) * window.devicePixelRatio;
      const viewport = pdfPage.getViewport({ scale });
      element.width = viewport.width;
      element.height = viewport.height;
      const render = pdfPage.render({ canvas: element, viewport });
      task = render;
      // A render rejects when it is cancelled for the next page; nothing is left to show.
      render.promise.then(() => !cancelled && setRendered(page)).catch(() => {});
    }, fail);
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);

  if (failed) {
    return (
      <p id="viewer-error" role="alert" className="p-4 text-sm text-danger">
        Não conseguimos abrir esta página. Recarregue a página dos autos e tente de novo.
      </p>
    );
  }

  return (
    <div
      id="viewer-page"
      data-rendered-page={rendered ?? undefined}
      style={{ width: `${zoom * 100}%` }}
      className="relative mx-auto rounded-sm bg-white shadow-xl ring-1 ring-black/5"
    >
      <canvas ref={canvas} className="block h-auto w-full" />
      {rendered === page &&
        marks.map((box, index) => (
          <span
            key={index}
            id={`viewer-mark-${index}`}
            aria-hidden
            className="pointer-events-none absolute rounded-sm bg-mark ring-1 ring-mark-ring mix-blend-multiply"
            style={{
              left: `${box.x0 * 100}%`,
              top: `${box.y0 * 100}%`,
              width: `${(box.x1 - box.x0) * 100}%`,
              height: `${(box.y1 - box.y0) * 100}%`,
            }}
          />
        ))}
    </div>
  );
}
