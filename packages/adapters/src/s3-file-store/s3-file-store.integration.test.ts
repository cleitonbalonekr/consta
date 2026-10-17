import { fileStoreContract } from "@consta/core/contracts";
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

fileStoreContract(async () => ({ files, putPart }));
