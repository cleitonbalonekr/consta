import { fileStoreContract } from "@consta/core/contracts";
import { describe, expect, it } from "vitest";
import { S3FileStore } from "./index";

// MinIO from docker-compose.yml, with the settings in .env.example.
const env = process.env;
const files = new S3FileStore({
  endpoint: env.S3_ENDPOINT ?? "http://localhost:9000",
  region: env.S3_REGION ?? "us-east-1",
  bucket: env.S3_BUCKET ?? "consta",
  accessKeyId: env.S3_ACCESS_KEY_ID ?? "consta",
  secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "consta-secret",
});

/** What the browser does with a signed part URL. */
async function putPart(url: string, bytes: Uint8Array) {
  // Node's fetch takes a Uint8Array body; the cast only drops the ArrayBufferLike width.
  const response = await fetch(url, { method: "PUT", body: bytes as Uint8Array<ArrayBuffer> });
  if (!response.ok) throw new Error(`PUT of a part failed with ${response.status}: ${await response.text()}`);
}

/** What the viewer's pdf.js does with a signed read URL. An HTTP range includes its last byte; ours ends before `end`. */
async function readRange(url: string, { start, end }: { start: number; end: number }, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers: { ...headers, Range: `bytes=${start}-${end - 1}` } });
  return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) };
}

fileStoreContract(async () => ({ files, putPart, readRange }));

describe("S3FileStore read URL", () => {
  it("lets the browser's origin read the range headers, which pdf.js needs to load pages on demand", async () => {
    const key = `contract/${crypto.randomUUID()}.pdf`;
    const { uploadId } = await files.startMultipart(key, "application/pdf");
    await putPart(await files.signPart(key, uploadId, 1), new Uint8Array(1_000));
    await files.completeMultipart(key, uploadId);

    // The E2E server's origin, one of those docker-compose.yml allows.
    const { headers } = await readRange(await files.readUrl(key, 60), { start: 0, end: 10 }, { Origin: "http://localhost:3100" });

    expect(headers.get("access-control-allow-origin")).toBe("http://localhost:3100");
    const exposed = headers.get("access-control-expose-headers")?.toLowerCase() ?? "";
    for (const header of ["accept-ranges", "content-range", "content-length"]) expect(exposed).toContain(header);
  });
});
