"use server";

import { CaseFileId, QuotaExceeded } from "@consta/core";
import { revalidatePath } from "next/cache";
import { container } from "@/server/container";
import { currentLawyer } from "@/server/lawyer";

export type StartUploadResult =
  | { ok: true; caseFileId: string }
  | { ok: false; reason: "quota-exceeded"; pagesNeeded: number; pagesLeft: number };

/** Opens the upload of a new case file. The page count comes from the browser's pdf.js. */
export async function startUpload(file: { name: string; bytes: number; pages: number }): Promise<StartUploadResult> {
  const name = requireText(file?.name, "name");
  const bytes = requirePositiveInteger(file?.bytes, "bytes");
  const pages = requirePositiveInteger(file?.pages, "pages");
  try {
    const { caseFileId } = await container().caseFiles.startUpload(await currentLawyer(), { name, bytes, pages });
    return { ok: true, caseFileId };
  } catch (error) {
    if (!(error instanceof QuotaExceeded)) throw error;
    return { ok: false, reason: "quota-exceeded", pagesNeeded: error.pagesNeeded, pagesLeft: error.pagesLeft };
  }
}

/** A URL the browser PUTs one part of the PDF to. Parts are numbered from 1. */
export async function signUploadPart(caseFileId: string, partNumber: number): Promise<string> {
  const id = CaseFileId(requireText(caseFileId, "caseFileId"));
  return container().caseFiles.signUploadPart(await currentLawyer(), id, requirePositiveInteger(partNumber, "partNumber"));
}

/** Closes the upload once every part is stored, which starts ingestion. */
export async function finishUpload(caseFileId: string): Promise<void> {
  await container().caseFiles.finishUpload(await currentLawyer(), CaseFileId(requireText(caseFileId, "caseFileId")));
  revalidatePath("/");
}

export async function removeCaseFile(caseFileId: string): Promise<void> {
  await container().caseFiles.remove(await currentLawyer(), CaseFileId(requireText(caseFileId, "caseFileId")));
  revalidatePath("/");
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
