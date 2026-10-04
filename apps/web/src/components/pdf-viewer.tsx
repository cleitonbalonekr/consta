"use client";

import type { Citation } from "@consta/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { openPdf } from "@/lib/pdf";
import { citationLabel } from "./answer";

type PdfViewerProps = {
  pdfUrl: string;
  /** The citation to show: the viewer opens at its page and marks its boxes there. */
  citation: Citation;
  onClose: () => void;
};

/** Shows one page of the case file at a time, with the cited text marked on the cited page. */
export function PdfViewer({ pdfUrl, citation, onClose }: PdfViewerProps) {
  const pdf = usePdf(pdfUrl);
  const [page, setPage] = useState(citation.page);
  const [shownCitation, setShownCitation] = useState(citation);
  // Opening another citation moves the viewer to its page.
  if (shownCitation !== citation) {
    setShownCitation(citation);
    setPage(citation.page);
  }

  const pageCount = pdf && pdf !== "failed" ? pdf.numPages : null;
  const onCitedPage = page === citation.page;

  return (
    <section id="viewer" data-page={page} aria-label="Visualizador dos autos" className="flex h-full flex-col bg-zinc-100">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            id="viewer-previous-page"
            type="button"
            aria-label="Página anterior"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded px-2 py-1 text-zinc-700 hover:bg-zinc-100 disabled:opacity-30"
          >
            ←
          </button>
          <span id="viewer-page-number" className="min-w-28 text-center text-sm tabular-nums text-zinc-800">
            Página {page}
            {pageCount !== null && ` de ${pageCount}`}
            {onCitedPage && citation.folha && ` · fls. ${citation.folha}`}
          </span>
          <button
            id="viewer-next-page"
            type="button"
            aria-label="Próxima página"
            disabled={pageCount === null || page >= pageCount}
            onClick={() => setPage(page + 1)}
            className="rounded px-2 py-1 text-zinc-700 hover:bg-zinc-100 disabled:opacity-30"
          >
            →
          </button>
        </div>
        <button id="viewer-close" type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100">
          Fechar
        </button>
      </header>
      <blockquote id="viewer-quote" className="border-b border-zinc-200 bg-amber-50 px-4 py-2 text-sm text-zinc-800">
        <span className="mr-2 text-xs font-semibold text-amber-900">{citationLabel(citation)}</span>“{citation.quote}”
      </blockquote>
      <div className="flex-1 overflow-auto p-3">
        {pdf === "failed" ? (
          <p id="viewer-error" role="alert" className="p-4 text-sm text-red-700">
            Não conseguimos abrir os autos. Feche e tente de novo.
          </p>
        ) : pdf ? (
          <PdfPage pdf={pdf} page={page} marks={onCitedPage ? citation.boxes : []} />
        ) : (
          <p className="p-4 text-sm text-zinc-500">Abrindo os autos…</p>
        )}
      </div>
    </section>
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

type PdfPageProps = { pdf: PDFDocumentProxy; page: number; marks: Citation["boxes"] };

/** Renders one page to fit the width, with marks placed from box fractions so they follow any zoom. */
function PdfPage({ pdf, page, marks }: PdfPageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    void pdf.getPage(page).then((pdfPage) => {
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
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page]);

  return (
    <div id="viewer-page" data-rendered-page={rendered ?? undefined} className="relative mx-auto bg-white shadow">
      <canvas ref={canvas} className="block h-auto w-full" />
      {rendered === page &&
        marks.map((box, index) => (
          <span
            key={index}
            id={`viewer-mark-${index}`}
            aria-hidden
            className="pointer-events-none absolute rounded-sm bg-yellow-300/45 ring-1 ring-yellow-500/60"
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
