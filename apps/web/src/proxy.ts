import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SIGN_IN_PATH } from "@/lib/routes";

/**
 * Sends signed-out visitors to sign-in. It only looks for the session cookie;
 * `currentLawyer` checks the session itself and redirects when it isn't valid.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
}

export const config = {
  // Every route but sign-in, Better Auth's routes, the health check and static files.
  matcher: ["/((?!entrar$|api/auth/|api/health$|_next/static/|_next/image|favicon\\.ico$).*)"],
};
