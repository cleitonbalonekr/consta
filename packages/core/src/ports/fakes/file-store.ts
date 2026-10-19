import type { FileStore, UploadedPart } from "../file-store";

type Upload = { key: string; parts: Map<number, Uint8Array> };

/** Keeps objects in memory. `putPart` stands in for the browser's PUT to a signed URL. */
export class InMemoryFileStore implements FileStore {
  readonly objects = new Map<string, Uint8Array>();
  private readonly uploads = new Map<string, Upload>();
  /** Upload id to key, so completing an upload again returns the same size. */
  private readonly completed = new Map<string, string>();
  private nextUploadId = 1;

  async startMultipart(key: string, _contentType: string) {
    const uploadId = `upload-${this.nextUploadId++}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    return { uploadId };
  }

  async signPart(key: string, uploadId: string, partNumber: number) {
    this.upload(key, uploadId);
    const search = new URLSearchParams({ key, uploadId, partNumber: String(partNumber) });
    return `memory://part?${search}`;
  }

  /** Test helper: what the browser does with a URL from signPart. */
  async putPart(url: string, bytes: Uint8Array) {
    const search = new URL(url).searchParams;
    this.upload(search.get("key")!, search.get("uploadId")!).parts.set(Number(search.get("partNumber")), bytes);
  }

  /** Test helper: stores a whole object at once. */
  async put(key: string, bytes: Uint8Array) {
    this.objects.set(key, bytes);
  }

  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    return [...this.upload(key, uploadId).parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([partNumber, bytes]) => ({ partNumber, etag: `etag-${partNumber}`, size: bytes.length }));
  }

  async completeMultipart(key: string, uploadId: string) {
    if (this.completed.get(uploadId) === key) return { bytes: (await this.read(key)).length };
    const parts = [...this.upload(key, uploadId).parts.entries()].sort(([a], [b]) => a - b);
    const whole = new Uint8Array(parts.reduce((total, [, bytes]) => total + bytes.length, 0));
    let offset = 0;
    for (const [, bytes] of parts) {
      whole.set(bytes, offset);
      offset += bytes.length;
    }
    this.objects.set(key, whole);
    this.uploads.delete(uploadId);
    this.completed.set(uploadId, key);
    return { bytes: whole.length };
  }

  async abortMultipart(key: string, uploadId: string) {
    this.upload(key, uploadId);
    this.uploads.delete(uploadId);
  }

  async readUrl(key: string, expiresInSeconds: number) {
    return `memory://${key}?expiresIn=${expiresInSeconds}`;
  }

  async read(key: string, range?: { start: number; end: number }) {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error(`No object at ${key}.`);
    return range ? bytes.slice(range.start, range.end) : bytes;
  }

  async remove(key: string) {
    this.objects.delete(key);
  }

  private upload(key: string, uploadId: string) {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error(`No upload ${uploadId} for ${key}.`);
    return upload;
  }
}
