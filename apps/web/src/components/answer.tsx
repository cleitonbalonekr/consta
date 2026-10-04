import type { Citation, Statement } from "@consta/core";

/** How a citation names its page: "p. 12", plus "fls. 34" when the page has a folha. */
export function citationLabel(citation: Citation) {
  return citation.folha ? `p. ${citation.page} · fls. ${citation.folha}` : `p. ${citation.page}`;
}

type AnswerProps = {
  statements: Statement[];
  onOpenCitation: (citation: Citation) => void;
  /** The citation open in the viewer, highlighted in the answer. */
  openCitation?: Citation | null;
};

/** An answer as a list of statements, each followed by the citations that support it. */
export function Answer({ statements, onOpenCitation, openCitation }: AnswerProps) {
  return (
    <ol className="flex flex-col gap-3">
      {statements.map((statement, index) => (
        <li key={index} id={`statement-${index}`} className="leading-relaxed text-zinc-800">
          <span>{statement.text}</span>{" "}
          <span className="inline-flex flex-wrap gap-1 align-baseline">
            {statement.citations.map((citation, citationIndex) => (
              <button
                key={citationIndex}
                id={`citation-${index}-${citationIndex}`}
                type="button"
                onClick={() => onOpenCitation(citation)}
                title={citation.quote}
                className={`rounded border px-1.5 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                  citation === openCitation
                    ? "border-blue-800 bg-blue-800 text-white"
                    : "border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-400"
                }`}
              >
                {citationLabel(citation)}
              </button>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
