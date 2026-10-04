import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/**
 * Demo mode only: stands in for the signed storage URLs, so the browser uploads
 * parts and the viewer reads PDFs exactly as it will against real storage.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/demo/files/[...key]">) {
  const files = container().demoFiles;
  if (!files) return new Response(null, { status: 404 });

  const key = (await ctx.params).key.join("/");
  const search = new URL(request.url).searchParams;
  const uploadId = search.get("uploadId");
  const partNumber = Number(search.get("partNumber"));
  if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1) return new Response(null, { status: 400 });

  await files.putPart(key, uploadId, partNumber, new Uint8Array(await request.arrayBuffer()));
  return new Response(null, { status: 200, headers: { ETag: `"etag-${partNumber}"` } });
}

export async function GET(_request: Request, ctx: RouteContext<"/api/demo/files/[...key]">) {
  const files = container().demoFiles;
  if (!files) return new Response(null, { status: 404 });

  const key = (await ctx.params).key.join("/");
  const bytes = await files.read(key).catch(() => null);
  if (!bytes) return new Response(null, { status: 404 });
  // The in-memory store only ever holds ArrayBuffer-backed arrays, which Response accepts.
  return new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
}
