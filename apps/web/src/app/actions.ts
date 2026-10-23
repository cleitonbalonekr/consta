"use server";

import { CaseFileId, InvalidFileSize, InvalidPageCount, QuotaExceeded } from "@consta/core";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/lib/routes";
import { container } from "@/server/container";
import { currentLawyerWithEmail, currentLawyer } from "@/server/lawyer";

/** Why a case file was refused. The lawyer sees each one; nothing else is a refusal. */
export type UploadRefusal =
  | { ok: false; reason: "quota-exceeded"; pagesNeeded: number; pagesLeft: number }
  | { ok: false; reason: "too-many-pages" }
  | { ok: false; reason: "too-large" };

export type StartUploadResult = { ok: true; caseFileId: string } | UploadRefusal;

/** Opens the upload of a new case file. The page count comes from the browser's pdf.js. */
export async function startUpload(file: { name: string; bytes: number; pages: number }): Promise<StartUploadResult> {
  const name = requireText(file?.name, "name");
  const bytes = requirePositiveInteger(file?.bytes, "bytes");
  const pages = requirePositiveInteger(file?.pages, "pages");
  try {
    const { caseFileId } = await container().caseFiles.startUpload(await currentLawyer(), { name, bytes, pages });
    return { ok: true, caseFileId };
  } catch (error) {
    return refusal(error);
  }
}

/** A URL the browser PUTs one part of the PDF to. Parts are numbered from 1. */
export async function signUploadPart(caseFileId: string, partNumber: number): Promise<string> {
  const id = CaseFileId(requireText(caseFileId, "caseFileId"));
  return container().caseFiles.signUploadPart(await currentLawyer(), id, requirePositiveInteger(partNumber, "partNumber"));
}

/** The numbers of the parts already stored, so an interrupted upload sends only the others. */
export async function uploadedParts(caseFileId: string): Promise<number[]> {
  const parts = await container().caseFiles.uploadedParts(await currentLawyer(), CaseFileId(requireText(caseFileId, "caseFileId")));
  return parts.map((part) => part.partNumber);
}

/**
 * Closes the upload once every part is stored, which starts ingestion. The stored
 * PDF's page count can still exceed the quota, which refuses it.
 */
export async function finishUpload(caseFileId: string): Promise<{ ok: true } | UploadRefusal> {
  try {
    await container().caseFiles.finishUpload(await currentLawyer(), CaseFileId(requireText(caseFileId, "caseFileId")));
  } catch (error) {
    return refusal(error);
  } finally {
    revalidatePath("/");
  }
  return { ok: true };
}

export async function removeCaseFile(caseFileId: string): Promise<void> {
  await container().caseFiles.remove(await currentLawyer(), CaseFileId(requireText(caseFileId, "caseFileId")));
  revalidatePath("/");
}

/** Where Stripe sends the lawyer back to, after Checkout or the billing portal. */
const PLAN_PATH = "/plano";

/** Sends a lawyer on Trial to Stripe Checkout to pay for Pro; one already paying goes to the billing portal. */
export async function upgradeToPro(): Promise<void> {
  const { id, email } = await currentLawyerWithEmail();
  redirect(await container().plans.checkoutUrl(id, email, await appUrl(PLAN_PATH)));
}

/** Sends a lawyer who has opened Checkout to the Stripe billing portal, to change their card or cancel. */
export async function manageBilling(): Promise<void> {
  redirect(await container().plans.portalUrl(await currentLawyer(), await appUrl(PLAN_PATH)));
}

/** Ends the lawyer's session and returns to sign-in. */
export async function signOut(): Promise<void> {
  await container().auth.api.signOut({ headers: await headers() });
  redirect(SIGN_IN_PATH);
}

/** An absolute URL of this app. Browsers send Origin with every server action. */
async function appUrl(path: string): Promise<string> {
  const origin = (await headers()).get("origin");
  if (!origin) throw new TypeError("A server action request must carry an Origin header.");
  return new URL(path, origin).toString();
}

function refusal(error: unknown): UploadRefusal {
  if (error instanceof QuotaExceeded) {
    return { ok: false, reason: "quota-exceeded", pagesNeeded: error.pagesNeeded, pagesLeft: Math.max(0, error.pagesLeft) };
  }
  if (error instanceof InvalidPageCount) return { ok: false, reason: "too-many-pages" };
  if (error instanceof InvalidFileSize) return { ok: false, reason: "too-large" };
  throw error;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value.trim();
}

function requirePositiveInteger(value: unknown, name: string): number {
  // Number.isInteger narrows at runtime but isn't a type guard, so the casts are safe after it.
  if (!Number.isInteger(value) || (value as number) < 1) throw new TypeError(`${name} must be a positive integer.`);
  return value as number;
}
