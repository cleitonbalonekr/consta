import type { FileStore, UploadedPart } from "../file-store";

type Upload = { key: string; parts: Map<number, Uint8Array> };

/** Keeps objects in memory. `putPart` stands in for the browser's PUT to a signed URL. */
export class InMemoryFileStore implements FileStore {
  readonly objects = new Map<string, Uint8Array>();
  private readonly uploads = new Map<string, Upload>();
  private nextUploadId = 1;

  async startMultipart(key: string, _contentType: string) {
    const uploadId = `upload-${this.nextUploadId++}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    return { uploadId };
  }

  async signPart(key: string, uploadId: string, partNumber: number) {
    this.upload(key, uploadId);
    return `memory://${key}?uploadId=${uploadId}&partNumber=${partNumber}`;
  }

  /** Test helper: what the browser does with a signed part URL. */
  async putPart(key: string, uploadId: string, partNumber: number, bytes: Uint8Array) {
    this.upload(key, uploadId).parts.set(partNumber, bytes);
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

  async completeMultipart(key: string, uploadId: string, parts: UploadedPart[]) {
    const upload = this.upload(key, uploadId);
    const chunks = parts
      .map((part) => part.partNumber)
      .sort((a, b) => a - b)
      .map((n) => {
        const bytes = upload.parts.get(n);
        if (!bytes) throw new Error(`Part ${n} of ${key} was never uploaded.`);
        return bytes;
      });
    const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const whole = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      whole.set(chunk, offset);
      offset += chunk.length;
    }
    this.objects.set(key, whole);
    this.uploads.delete(uploadId);
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
