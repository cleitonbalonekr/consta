import { NotImplemented } from "@consta/core";
import type { FileStore } from "@consta/core/ports";

/** Any S3-compatible store: Cloudflare R2 now, AWS S3 in São Paulo later. */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Phase 4 (upload): implement with @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. */
export function createS3FileStore(_config: S3Config): FileStore {
  const todo = (method: string) => async (): Promise<never> => {
    throw new NotImplemented(`S3FileStore.${method}`);
  };
  return {
    startMultipart: todo("startMultipart"),
    signPart: todo("signPart"),
    listParts: todo("listParts"),
    completeMultipart: todo("completeMultipart"),
    abortMultipart: todo("abortMultipart"),
    readUrl: todo("readUrl"),
    read: todo("read"),
    remove: todo("remove"),
  };
}
