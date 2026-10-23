import "server-only";
import { LawyerId } from "@consta/core";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { isOperator } from "@/lib/operators";
import { SIGN_IN_PATH } from "@/lib/routes";
import { container } from "./container";

/** The signed-in lawyer, or null without a valid session. Looked up once per request. */
export const signedInLawyer = cache(async (): Promise<{ id: LawyerId; email: string } | null> => {
  const session = await container().auth.api.getSession({ headers: await headers() });
  return session ? { id: LawyerId(session.user.id), email: session.user.email } : null;
});

/** The lawyer making the current request. Without a session, redirects to sign-in. */
export async function currentLawyer(): Promise<LawyerId> {
  return (await currentLawyerWithEmail()).id;
}

/** Like currentLawyer, with the email the lawyer signed in with. */
export async function currentLawyerWithEmail(): Promise<{ id: LawyerId; email: string }> {
  const lawyer = await signedInLawyer();
  if (!lawyer) redirect(SIGN_IN_PATH);
  return lawyer;
}

/**
 * The signed-in operator. Without a session, redirects to sign-in; a lawyer who
 * isn't in OPERATOR_EMAILS gets a 404, so the operator pages don't show they exist.
 */
export async function currentOperator(): Promise<LawyerId> {
  const lawyer = await currentLawyerWithEmail();
  if (!isOperator(lawyer.email, process.env.OPERATOR_EMAILS)) notFound();
  return lawyer.id;
}
