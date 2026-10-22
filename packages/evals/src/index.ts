/**
 * Quality runs against real adapters: correct citation pages, document map
 * accuracy, extraction accuracy (PRD success metrics). They cost money, so
 * they run by hand before each pilot release, never in CI.
 *
 * citation-check.ts reads the 20 real questions and their expected pages from a
 * questions.json that Phase 0 writes; it is not in the repository, as it names a real case.
 */
export {};
