import type { AnsweringRepository } from "../answering";
import type { CaseFileRepository } from "../case-files";
import type { IngestionRepository } from "../ingestion";
import type { MeteringRepository } from "../metering";

/**
 * Runs work in one transaction and rolls it back when the work throws (ADR-0006).
 * A run inside a run joins the outer transaction, so a module can call another
 * module's method inside its own run and both commit together.
 */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

/**
 * Every module's repository, bound to the current transaction. A module reads and
 * writes only its own; it changes another module's data through that module's interface.
 */
export type Repositories = {
  caseFiles: CaseFileRepository;
  ingestion: IngestionRepository;
  answering: AnsweringRepository;
  metering: MeteringRepository;
};
