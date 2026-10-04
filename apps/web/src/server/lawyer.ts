import "server-only";
import { LawyerId } from "@consta/core";

/** Everyone is this one lawyer until sign-in arrives (ticket 02). */
export const DEMO_LAWYER = LawyerId("demo-lawyer");

/** The lawyer making the current request. */
export async function currentLawyer(): Promise<LawyerId> {
  return DEMO_LAWYER;
}
