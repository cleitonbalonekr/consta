import { InvalidStatus } from "../shared";
import type { CaseFileId, CaseFileStatus, LawyerId } from "../shared";
import type { FileSize, PageCount } from "./values";

/** What the Case files repository stores for one case file. */
export type CaseFileProps = {
  id: CaseFileId;
  lawyer: LawyerId;
  name: string;
  storageKey: string;
  /** The open multipart upload; null after the upload closes. */
  uploadId: string | null;
  sizeBytes: number;
  pageCount: number;
  status: CaseFileStatus;
  pagesDone: number;
  /** Why ingestion failed, in words the lawyer can read. */
  error: string | null;
  /** The scanned pages that ingestion did not read (ADR-0010). Empty until ready. */
  unreadPages: UnreadPages;
  createdAt: Date;
  readyAt: Date | null;
};

/** Ranges of page numbers, in order. Plain objects, so the repositories store them as they are. */
export type UnreadPages = Array<{ first: number; last: number }>;

/** The case file lifecycle in docs/architecture.md: the only moves a status can make. */
const NEXT_STATUSES: Record<CaseFileStatus, readonly CaseFileStatus[]> = {
  uploading: ["queued", "deleting"],
  queued: ["processing", "failed"],
  processing: ["mapping", "failed"],
  mapping: ["ready", "failed"],
  ready: ["deleting"],
  failed: ["deleting"],
  deleting: [],
};

/** The statuses startDeleting accepts: the moves to deleting in NEXT_STATUSES, and deleting itself. */
const DELETABLE: readonly CaseFileStatus[] = ["uploading", "ready", "failed", "deleting"];

/** The statuses ingestion moves a case file through, in order. */
const INGESTION_PATH: readonly CaseFileStatus[] = ["queued", "processing", "mapping", "ready"];

/** The statuses on the way to ready or failed, while the lawyer waits. */
const INGESTING: readonly CaseFileStatus[] = ["uploading", "queued", "processing", "mapping"];

/**
 * One uploaded case file and its status lifecycle (ADR-0007). Only its methods
 * change the status; each throws InvalidStatus for a move the lifecycle does not show.
 */
export class CaseFile {
  private constructor(private readonly props: CaseFileProps) {}

  /** A new case file whose upload just opened. The page count is the browser's until the upload closes. */
  static start(input: {
    id: CaseFileId;
    lawyer: LawyerId;
    name: string;
    storageKey: string;
    uploadId: string;
    size: FileSize;
    pages: PageCount;
    createdAt: Date;
  }): CaseFile {
    const { size, pages, ...rest } = input;
    return new CaseFile({
      ...rest,
      sizeBytes: size.bytes,
      pageCount: pages.value,
      status: "uploading",
      pagesDone: 0,
      error: null,
      unreadPages: [],
      readyAt: null,
    });
  }

  /** A case file as the repository stored it. */
  static restore(props: CaseFileProps): CaseFile {
    return new CaseFile({ ...props });
  }

  get id() {
    return this.props.id;
  }

  get status() {
    return this.props.status;
  }

  /** How many scanned pages ingestion did not read. 0 until ready. */
  get unreadPageCount(): number {
    return this.props.unreadPages.reduce((total, { first, last }) => total + last - first + 1, 0);
  }

  /**
   * No page has text: every page is a scanned page with no OCR text layer, so Consta read
   * nothing (ADR-0010). False until ready, since the unread pages are known only then.
   */
  get allPagesScanned(): boolean {
    return this.props.pageCount > 0 && this.unreadPageCount === this.props.pageCount;
  }

  /** A copy of the stored fields, for the repository and for views. */
  snapshot(): CaseFileProps {
    return { ...this.props };
  }

  /** Where the browser sends the parts. Throws InvalidStatus after the upload closes. */
  openUpload(): { key: string; uploadId: string } {
    const { status, storageKey, uploadId } = this.props;
    if (status !== "uploading" || !uploadId) throw new InvalidStatus(`Case file ${this.id} has no open upload.`);
    return { key: storageKey, uploadId };
  }

  /** The upload closed: keeps the size and page count read from the stored PDF, which replace the browser's. */
  queue(stored: { size: FileSize; pages: PageCount }) {
    this.moveTo("queued");
    this.props.uploadId = null;
    this.props.sizeBytes = stored.size.bytes;
    this.props.pageCount = stored.pages.value;
  }

  startProcessing() {
    this.moveTo("processing");
  }

  /**
   * Ranges run in parallel and a retried range reads its pages again, so the count
   * only goes up, and never past the page count. Throws InvalidStatus unless processing.
   */
  recordPagesRead(pages: number) {
    if (this.props.status !== "processing") throw new InvalidStatus(`Case file ${this.id} is not processing.`);
    this.props.pagesDone = Math.min(this.props.pageCount, Math.max(this.props.pagesDone, pages));
  }

  startMapping() {
    this.moveTo("mapping");
    this.props.pagesDone = this.props.pageCount;
  }

  markReady(at: Date, unreadPages: UnreadPages) {
    this.moveTo("ready");
    this.props.readyAt = at;
    this.props.unreadPages = unreadPages.map(({ first, last }) => ({ first, last }));
  }

  fail(reason: string) {
    this.moveTo("failed");
    this.props.error = reason;
  }

  /** Does nothing on a case file already deleting, so a remove that stopped part way can run again. */
  startDeleting() {
    if (this.props.status !== "deleting") this.moveTo("deleting");
  }

  /** Whether startDeleting may run: anywhere but while ingestion reads the case file. */
  get deletable(): boolean {
    return DELETABLE.includes(this.props.status);
  }

  /** Whether the case file is still on its way to ready or failed. */
  get ingesting(): boolean {
    return INGESTING.includes(this.props.status);
  }

  /** Whether ingestion already took the case file to `status`, or past it on the way to ready. */
  reached(status: CaseFileStatus): boolean {
    if (this.props.status === status) return true;
    const at = INGESTION_PATH.indexOf(this.props.status);
    const target = INGESTION_PATH.indexOf(status);
    return at >= 0 && target >= 0 && at > target;
  }

  private moveTo(next: CaseFileStatus) {
    const { status } = this.props;
    if (!NEXT_STATUSES[status].includes(next)) {
      throw new InvalidStatus(`Case file ${this.id} can't go from ${status} to ${next}.`);
    }
    this.props.status = next;
  }
}
