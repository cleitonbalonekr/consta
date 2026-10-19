/** One part of a multipart upload that has reached storage. */
export type UploadedPart = { partNumber: number; etag: string; size: number };

/**
 * Stores case-file PDFs. The browser uploads parts directly with signed URLs,
 * so file bytes never pass through our server.
 */
export interface FileStore {
  startMultipart(key: string, contentType: string): Promise<{ uploadId: string }>;
  /** A URL the browser can PUT one part to. */
  signPart(key: string, uploadId: string, partNumber: number): Promise<string>;
  /** The parts stored so far, in part order, so the browser can resume and send only the others. */
  listParts(key: string, uploadId: string): Promise<UploadedPart[]>;
  /**
   * Joins every stored part into one object and returns its size. Completing an
   * upload that is already complete returns the same size, so a caller may retry.
   */
  completeMultipart(key: string, uploadId: string): Promise<{ bytes: number }>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** A signed URL the viewer can read with HTTP range requests. */
  readUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Reads the whole object, or the byte range [start, end) when given. */
  read(key: string, range?: { start: number; end: number }): Promise<Uint8Array>;
  /** Removing a missing key is not an error. */
  remove(key: string): Promise<void>;
}
