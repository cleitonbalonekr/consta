import "server-only";
import { LawyerId } from "@consta/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SIGN_IN_PATH } from "@/lib/routes";
import { container } from "./container";

/** The signed-in lawyer, or null without a valid session. Looked up once per request. */
export const signedInLawyer = cache(async (): Promise<{ id: LawyerId; email: string } | null> => {
  const session = await container().auth.api.getSession({ headers: await headers() });
  return session ? { id: LawyerId(session.user.id), email: session.user.email } : null;
});

/** The lawyer making the current request. Without a session, redirects to sign-in. */
export async function currentLawyer(): Promise<LawyerId> {
  const lawyer = await signedInLawyer();
  if (!lawyer) redirect(SIGN_IN_PATH);
  return lawyer.id;
}
