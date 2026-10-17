import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileStore, UploadedPart } from "@consta/core/ports";

/** Any S3-compatible store: MinIO locally, Cloudflare R2 now, AWS S3 in São Paulo later. */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** A part URL must last for the PUT of a 10 MB part on a slow connection. */
const PART_URL_SECONDS = 60 * 60;

export class S3FileStore implements FileStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey }: S3Config) {
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // MinIO serves buckets by path, not by subdomain; R2 and S3 accept both.
      forcePathStyle: true,
      // By default the SDK signs a checksum of the body into part URLs, which the browser can't send.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async startMultipart(key: string, contentType: string) {
    const { UploadId } = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!UploadId) throw new Error(`S3 returned no upload id for ${key}.`);
    return { uploadId: UploadId };
  }

  signPart(key: string, uploadId: string, partNumber: number) {
    const command = new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
    return getSignedUrl(this.client, command, { expiresIn: PART_URL_SECONDS });
  }

  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    do {
      const page = await this.client.send(
        new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
      );
      for (const { PartNumber, ETag, Size } of page.Parts ?? []) {
        parts.push({ partNumber: PartNumber!, etag: ETag!, size: Size! });
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async completeMultipart(key: string, uploadId: string) {
    let parts: UploadedPart[];
    try {
      parts = await this.listParts(key, uploadId);
    } catch (error) {
      // S3 forgets an upload once it completes; the object it made is then the answer.
      if (error instanceof Error && error.name === "NoSuchUpload") return { bytes: await this.size(key) };
      throw error;
    }
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag })) },
      }),
    );
    return { bytes: parts.reduce((total, part) => total + part.size, 0) };
  }

  async abortMultipart(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  readUrl(key: string, expiresInSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  async read(key: string, range?: { start: number; end: number }) {
    // An HTTP range includes its last byte; ours ends before `end`.
    const Range = range ? `bytes=${range.start}-${range.end - 1}` : undefined;
    const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range }));
    if (!Body) throw new Error(`S3 returned no body for ${key}.`);
    return Body.transformToByteArray();
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private async size(key: string) {
    const { ContentLength } = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    if (ContentLength === undefined) throw new Error(`S3 returned no size for ${key}.`);
    return ContentLength;
  }
}
