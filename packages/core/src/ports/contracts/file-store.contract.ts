import { describe, expect, it } from "vitest";
import type { FileStore } from "../file-store";

export type FileStoreSetup = () => Promise<{
  files: FileStore;
  /** What the browser does: PUTs the bytes of one part to the URL that signPart gives. */
  putPart: (url: string, bytes: Uint8Array) => Promise<void>;
}>;

/** S3 refuses a part under 5 MiB unless it is the last one. */
const FIRST_PART = 5 * 1024 * 1024;

function bytesOf(length: number, seed: number) {
  return Uint8Array.from({ length }, (_, i) => (i * 31 + seed) % 251);
}

/** The cases every FileStore adapter passes: the in-memory fake and S3 (MinIO locally). */
export function fileStoreContract(setup: FileStoreSetup) {
  describe("FileStore contract", () => {
    const newKey = () => `contract/${crypto.randomUUID()}.pdf`;

    async function uploadTwoParts(files: FileStore, putPart: (url: string, bytes: Uint8Array) => Promise<void>) {
      const key = newKey();
      const [first, second] = [bytesOf(FIRST_PART, 1), bytesOf(1_000, 2)];
      const { uploadId } = await files.startMultipart(key, "application/pdf");
      // Out of order on purpose: the store joins the parts by part number.
      await putPart(await files.signPart(key, uploadId, 2), second);
      await putPart(await files.signPart(key, uploadId, 1), first);
      return { key, uploadId, first, second };
    }

    it("lists the stored parts in part order, so an upload can resume", async () => {
      const { files, putPart } = await setup();
      const key = newKey();
      const { uploadId } = await files.startMultipart(key, "application/pdf");
      await putPart(await files.signPart(key, uploadId, 1), bytesOf(FIRST_PART, 1));

      const parts = await files.listParts(key, uploadId);

      expect(parts).toEqual([{ partNumber: 1, etag: expect.any(String), size: FIRST_PART }]);
    });

    it("joins the parts in part order and returns the size", async () => {
      const { files, putPart } = await setup();
      const { key, uploadId, first, second } = await uploadTwoParts(files, putPart);

      expect(await files.completeMultipart(key, uploadId)).toEqual({ bytes: first.length + second.length });

      const whole = await files.read(key);
      expect(whole.length).toBe(first.length + second.length);
      expect(whole.slice(0, 3)).toEqual(first.slice(0, 3));
      expect(whole.slice(first.length)).toEqual(second);
    });

    it("returns the same size when an upload is completed again", async () => {
      const { files, putPart } = await setup();
      const { key, uploadId, first, second } = await uploadTwoParts(files, putPart);
      await files.completeMultipart(key, uploadId);

      expect(await files.completeMultipart(key, uploadId)).toEqual({ bytes: first.length + second.length });
    });

    it("reads the byte range [start, end)", async () => {
      const { files, putPart } = await setup();
      const { key, uploadId, first } = await uploadTwoParts(files, putPart);
      await files.completeMultipart(key, uploadId);

      expect(await files.read(key, { start: 10, end: 20 })).toEqual(first.slice(10, 20));
    });

    it("removes an object, and removing a missing key is not an error", async () => {
      const { files, putPart } = await setup();
      const { key, uploadId } = await uploadTwoParts(files, putPart);
      await files.completeMultipart(key, uploadId);

      await files.remove(key);
      await files.remove(key);

      await expect(files.read(key)).rejects.toThrow();
    });
  });
}
