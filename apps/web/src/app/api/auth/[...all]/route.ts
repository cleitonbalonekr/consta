import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/** Better Auth's routes: sending the sign-in link, verifying it, reading and ending the session. */
function handle(request: Request) {
  return container().auth.handler(request);
}

export { handle as GET, handle as POST };
