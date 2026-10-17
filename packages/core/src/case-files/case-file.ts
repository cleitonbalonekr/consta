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
  createdAt: Date;
  readyAt: Date | null;
};

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

  startMapping() {
    this.moveTo("mapping");
  }

  markReady(at: Date) {
    this.moveTo("ready");
    this.props.readyAt = at;
  }

  fail(reason: string) {
    this.moveTo("failed");
    this.props.error = reason;
  }

  startDeleting() {
    this.moveTo("deleting");
  }

  private moveTo(next: CaseFileStatus) {
    const { status } = this.props;
    if (!NEXT_STATUSES[status].includes(next)) {
      throw new InvalidStatus(`Case file ${this.id} can't go from ${status} to ${next}.`);
    }
    this.props.status = next;
  }
}
