import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/** Confirms the server can build its modules. Doesn't touch the database. */
export function GET() {
  container();
  return Response.json({ ok: true });
}
