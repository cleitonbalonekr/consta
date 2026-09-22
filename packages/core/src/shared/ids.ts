declare const brand: unique symbol;

/** A string that the type system keeps apart from other ids. */
type Id<Name extends string> = string & { readonly [brand]: Name };

export type LawyerId = Id<"LawyerId">;
export type CaseFileId = Id<"CaseFileId">;
export type PecaId = Id<"PecaId">;
export type QuestionId = Id<"QuestionId">;

export const LawyerId = (value: string) => value as LawyerId;
export const CaseFileId = (value: string) => value as CaseFileId;
export const PecaId = (value: string) => value as PecaId;
export const QuestionId = (value: string) => value as QuestionId;
