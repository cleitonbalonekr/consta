import type { UnreadPages as UnreadPageRanges } from "@consta/core";
import { ScanLine } from "lucide-react";
import { formatNumber } from "@/lib/format";

/** "p. 3–4, 9 e 12–20". */
export function unreadPagesLabel(ranges: UnreadPageRanges) {
  const parts = ranges.map(({ first, last }) => (first === last ? formatNumber(first) : `${formatNumber(first)}–${formatNumber(last)}`));
  const listed = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
  return `p. ${listed}`;
}

/**
 * The scanned pages that were not read (ADR-0010). The lawyer must see them: no answer
 * cites them, so "the file does not mention X" covers only the pages that were read.
 */
export function UnreadPages({ ranges }: { ranges: UnreadPageRanges }) {
  if (ranges.length === 0) return null;
  const count = ranges.reduce((total, { first, last }) => total + last - first + 1, 0);
  return (
    <div id="unread-pages" role="note" className="flex items-start gap-2.5 border-b border-line bg-warning-soft px-4 py-2.5 text-sm sm:px-6">
      <ScanLine className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p className="text-foreground">
        <span className="font-medium">
          {count === 1 ? "1 página digitalizada não foi lida" : `${formatNumber(count)} páginas digitalizadas não foram lidas`}:
        </span>{" "}
        <span id="unread-pages-list" className="tabular-nums">
          {unreadPagesLabel(ranges)}
        </span>
        . <span className="text-muted">As respostas não usam o que está nestas páginas.</span>
      </p>
    </div>
  );
}
