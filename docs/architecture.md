# Architecture

Consta is four deep modules (Case files, Ingestion, Answering, Metering) in one TypeScript package, called from two runtimes: the Next.js app and Trigger.dev tasks. External services and the database sit behind small ports with a production adapter and an in-memory fake. Each module owns a repository port for its tables, and a `UnitOfWork` port runs work in one transaction (ADR-0006).

Terms follow [`CONTEXT.md`](../CONTEXT.md) for the domain and the codebase-design vocabulary (module, interface, seam, adapter, depth) for the code. Decisions are in [`docs/adr/`](./adr/).

## Shape

```mermaid
flowchart LR
  subgraph Runtimes
    WEB["apps/web<br/>Next.js, Better Auth"]
    JOBS["apps/jobs<br/>Trigger.dev tasks"]
  end
  subgraph Core["packages/core"]
    CF["Case files"]
    ING["Ingestion"]
    ANS["Answering"]
    MET["Metering"]
    DB[("Postgres<br/>via Drizzle")]
  end
  subgraph Ports["Ports (external seams)"]
    FS["FileStore"]
    OCR["Ocr"]
    EMB["Embedder"]
    RR["Reranker"]
    CM["CitingModel"]
    MX["MapExtractor"]
    JB["Jobs"]
    ML["Mailer"]
  end
  WEB --> CF
  WEB --> ANS
  WEB --> MET
  JOBS --> ING
  CF --> FS
  CF --> JB
  CF --> MET
  ING --> FS
  ING --> OCR
  ING --> EMB
  ING --> MX
  ING --> MET
  ING --> ML
  ANS --> EMB
  ANS --> RR
  ANS --> CM
  ANS --> MET
  CF --> DB
  ING --> DB
  ANS --> DB
  MET --> DB
```

The web app's screens only call Case files and Answering; its sign-in calls Metering once, to give a new lawyer the Trial plan. The task runtime only calls Ingestion. Modules never call each other's internals; Case files starts Ingestion through the `Jobs` port, not by importing it.

## Modules

| Module | What callers know (interface) | What it hides (implementation) | Called by |
| --- | --- | --- | --- |
| **Case files** | Start and finish an upload, view, list, get a read URL, remove | Status lifecycle, page-quota check, multipart upload bookkeeping, ownership checks, ordered deletion of every derived row and the stored PDF | `apps/web` |
| **Ingestion** | `plan`, `ingestRange`, `map`, `fail`, run in that order; every step is idempotent | Page classification, text and block extraction, OCR of scanned pages, folha detection, passage splitting inside a page, embedding, document map windowing and merging, facts, progress, the ready email | `apps/jobs`, the inline `Jobs` adapter |
| **Answering** | `ask` returns a stream of statements, each with at least one citation | Scope handling, hybrid search and reranking, source blocks per page, token budget, prompt caching, citation-to-page resolution, dropping uncited statements, saving the question, metering | `apps/web` |
| **Metering** | `record` usage, `startTrial` and `pagesLeft` for a lawyer | Cost per provider and unit, the monthly page-quota window, plan limits | The other three modules, the web app's sign-in, the operator page |

Each module is a folder whose `index.ts` is its whole interface. Code outside the folder imports only from `index.ts`; a lint rule (`no-restricted-imports` on deep paths) enforces it.

### Why these four

- **Answering is the deepest module and the reason the product exists.** The rule "no citation, no statement" lives in one place, so it is fixed once and tested once (ADR-0003).
- **Ingestion owns all page-level knowledge.** Classification, OCR and the rule that a passage never crosses a page break stay together. Splitting them into a "parser", an "OCR service" and an "indexer" would create shallow modules that must agree on page and block formats across three interfaces.
- **Case files owns the lifecycle.** Status changes, quota and deletion rules sit in one module instead of being spread across route handlers.
- **Metering passes the deletion test.** Without it, cost lookup and quota maths would reappear in the other three modules.

### Domain rules the modules enforce

- **A citation names the PDF page and, when the page has one, its folha.** Ingestion detects the stamped folha; Answering adds it to each citation.
- **Every upload is a new case file**, even a newer download of the same lawsuit. Updating an existing case file comes after the pilot.
- **Pages count against the page quota once ingested** and are not given back when a case file is deleted. They are charged when the upload finishes and given back if ingestion fails.
- **A lawyer owns case files directly.** When firms arrive, a firm workspace will own case files and lawyers will belong to it; module interfaces take a `LawyerId` today and will take the owner instead.

## Interfaces

Sketches. They name every fact a caller must know, including order and error modes.

```ts
// packages/core/src/case-files/index.ts
export function createCaseFiles(deps: { uow: UnitOfWork; files: FileStore; jobs: Jobs; metering: Metering }): CaseFiles;

export interface CaseFiles {
  /** The browser reads the page count with pdf.js first. Throws QuotaExceeded before any upload starts. */
  startUpload(lawyer: LawyerId, file: { name: string; bytes: number; pages: number }): Promise<{ caseFileId: CaseFileId; uploadId: string }>;
  signUploadPart(lawyer: LawyerId, caseFileId: CaseFileId, partNumber: number): Promise<string>;
  uploadedParts(lawyer: LawyerId, caseFileId: CaseFileId): Promise<UploadedPart[]>; // lets Uppy resume
  /** Closes the upload, recounts pages, re-checks the quota, then starts ingestion. Idempotent. */
  finishUpload(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileView>;
  view(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileView>; // status, progress, document map
  list(lawyer: LawyerId): Promise<CaseFileSummary[]>;
  readUrl(lawyer: LawyerId, caseFileId: CaseFileId): Promise<string>; // signed, supports HTTP range requests
  remove(lawyer: LawyerId, caseFileId: CaseFileId): Promise<void>;
}
```

```ts
// packages/core/src/ingestion/index.ts
export function createIngestion(deps: { uow: UnitOfWork; files: FileStore; ocr: Ocr; embedder: Embedder; extractor: MapExtractor; mailer: Mailer; metering: Metering }): Ingestion;

/** Call order: plan, then ingestRange for every range (in parallel), then map. Any step may be retried. */
export interface Ingestion {
  plan(caseFileId: CaseFileId): Promise<PageRange[]>;
  /** A retry replaces the pages and passages of that range only. */
  ingestRange(caseFileId: CaseFileId, range: PageRange): Promise<void>;
  /** Builds the document map and facts from all pages, marks the case file ready and emails the lawyer. */
  map(caseFileId: CaseFileId): Promise<void>;
  fail(caseFileId: CaseFileId, reason: string): Promise<void>;
}
```

```ts
// packages/core/src/answering/index.ts
export function createAnswering(deps: { uow: UnitOfWork; embedder: Embedder; reranker: Reranker; model: CitingModel; metering: Metering }): Answering;

export interface Answering {
  ask(lawyer: LawyerId, question: QuestionInput): AsyncIterable<AnswerEvent>;
}

export type QuestionInput =
  | { caseFileId: CaseFileId; scope: Scope; text: string }
  | { caseFileId: CaseFileId; quickAction: "timeline" | "people" | "amounts" };

export type Scope = { kind: "whole-file" } | { kind: "peca"; pecaId: PecaId };

export type AnswerEvent =
  | { type: "statement"; statement: Statement }
  | { type: "refused"; reason: "not-ready" | "scope-too-large" }
  | { type: "done"; questionId: QuestionId; dropped: number }; // dropped = uncited statements removed

export type Statement = { text: string; citations: [Citation, ...Citation[]] }; // never empty, by type
export type Citation = { page: number; folha: string | null; quote: string; boxes: Box[] };
```

```ts
// packages/core/src/metering/index.ts
export function createMetering(deps: { uow: UnitOfWork }): Metering;

export interface Metering {
  record(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]): Promise<void>;
  /** On a lawyer's first sign-in. A lawyer who already has a plan keeps it. */
  startTrial(lawyer: LawyerId): Promise<void>;
  pagesLeft(lawyer: LawyerId): Promise<number>;
  /** Checks and charges in one transaction; throws QuotaExceeded. Idempotent per case file. */
  chargePages(lawyer: LawyerId, caseFileId: CaseFileId, pages: number): Promise<void>;
}
```

```ts
// packages/core/src/ports/unit-of-work.ts
/**
 * Runs work in one transaction and rolls it back when the work throws. A run
 * inside a run joins the outer transaction, so a module can call another
 * module's method inside its own run and both commit together.
 */
export interface UnitOfWork {
  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

/** Every module's repository, bound to the current transaction. */
export type Repositories = {
  caseFiles: CaseFileRepository;
  ingestion: IngestionRepository;
  answering: AnsweringRepository;
  metering: MeteringRepository;
};
```

A module reads and writes only its own repository from `repos`. To change another module's data, it calls that module's interface inside the same run. For example, `finishUpload` runs `metering.chargePages` and `repos.caseFiles.markQueued` in one run: the quota rule stays in Metering, and both writes commit or roll back together. Each module's repository type lives in its folder; the Drizzle adapters live in `src/db/repositories/`, the fakes in `src/ports/fakes/`.

## Seams and adapters

Each port is a real seam: it has a production adapter and an in-memory fake used by tests. Ports are shaped by what Consta needs, not by the vendor's API.

| Port | What it does | Production adapter | Test adapter |
| --- | --- | --- | --- |
| `FileStore` | Multipart upload, signed read URL, download, remove | S3-compatible client (Cloudflare R2 now, AWS S3 in São Paulo later) | In-memory store |
| `Ocr` | Reads a PDF of scanned pages into text blocks with bounding boxes and confidence | Mistral OCR | Returns fixture text |
| `Embedder` | Embeds passages and questions | Voyage | Deterministic hash vectors |
| `Reranker` | Orders passages for a question | Voyage | Keeps the input order |
| `CitingModel` | Answers from source blocks, returning text with the ids of the sources it cites | Claude with native citations | Scripted answers, including uncited ones |
| `MapExtractor` | Reads a window of pages and returns peças and facts | Claude Haiku | Scripted peças and facts |
| `Jobs` | Starts ingestion of a case file | Trigger.dev | Inline: runs plan, ranges and map in-process |
| `Mailer` | Sends a templated email | Resend | In-memory outbox |
| Repositories (one per module) | Read and write the module's tables, including hybrid search | Drizzle on Postgres | In-memory tables |
| `UnitOfWork` | Runs work in one transaction with repositories bound to it | Drizzle transaction | Copies the in-memory state and restores it if the work throws |

Every port that calls an AI provider returns `usage` with its result, and the calling module passes it to Metering.

### Not seams

| Dependency | Why it has no port | How tests handle it |
| --- | --- | --- |
| pdf.js, pdf-lib | In-process libraries | Fixture PDFs |
| Better Auth | Used only in `apps/web`; modules receive a `LawyerId`, which is the Better Auth user id | Module tests pass a `LawyerId`; `apps/web` tests sign in through Better Auth on PGlite, or on its in-memory adapter in demo mode |
| Trigger.dev task definitions | They are the `Jobs` adapter, not domain code | The inline `Jobs` adapter |

If the Phase 1 test needs a Python extractor, it becomes an internal seam inside Ingestion, not a port in the module's interface.

## Case file lifecycle

```mermaid
stateDiagram-v2
  [*] --> uploading: startUpload
  uploading --> queued: finishUpload
  uploading --> [*]: abandoned for 24 hours, cleaned up
  queued --> processing: first range starts
  processing --> mapping: all ranges done
  mapping --> ready: document map built
  processing --> failed: a range fails after 3 retries
  mapping --> failed
  ready --> deleting: remove
  failed --> deleting: remove
  deleting --> [*]
```

Questions are accepted only in `ready`. Any other state makes `ask` return `refused: "not-ready"`.

## Repository layout

```text
apps/
  web/                 Next.js: pages, route handlers, server actions, Better Auth; composition root
  jobs/                Trigger.dev tasks (ingest-case-file: plan, fan out ranges, map); composition root
packages/
  core/
    src/case-files/    module; index.ts is the interface
    src/ingestion/     module
    src/answering/     module
    src/metering/      module
    src/shared/        ids, value types and errors shared by the modules
    src/ports/         port types and their in-memory fakes
    src/db/            Drizzle schema, migrations, hybrid search SQL
  adapters/            r2-s3, mistral-ocr, voyage, anthropic, resend, trigger-jobs
  evals/               quality runs against real adapters; they cost money, so they run by hand
```

Dependencies point one way: `apps` import `core` and `adapters`; `adapters` import only `core/src/ports`; `core` never imports `adapters`. Each composition root picks adapters from environment variables.

## Testing

- **The interface is the test surface.** Each module is tested through its `index.ts` with in-memory repositories and the fake adapters. No tests reach into a module's internals.
- **Repositories are tested on Postgres.** Each Drizzle repository has integration tests on PGlite, and a contract test that its fake passes too.
- **One in-process end-to-end path.** With the inline `Jobs` adapter, a single test can upload a fixture PDF, run ingestion and ask a question without any network.
- **Fixture PDFs:** a short digital file, a short scanned file and a two-column file.
- **Answering's key tests:** a scripted model answer with one uncited statement must yield `dropped: 1`, and every citation must resolve to the page and boxes of its source block.
- **Port contract tests** run against the fake on every pull request and against the real adapter nightly.
- **Quality** (correct pages, document map accuracy) is measured in `packages/evals` with real adapters, not in unit tests.

## Changes from the PRD

| PRD | Now | Why |
| --- | --- | --- |
| `SearchIndex`, database, `TextExtractor` and `Auth` listed as ports | Not ports, except the database: each module has a repository port (ADR-0006) | `TextExtractor` and `Auth` would have one real adapter, or live only in the app; search is a method of Answering's repository |
| One generic `LlmClient.complete(role, request)` | Two ports shaped by use: `CitingModel` and `MapExtractor` | A generic port makes every caller handle citations and output parsing; the narrow ports keep that inside the adapter |
| Answers stream as text | Answers stream statement by statement | A statement can be shown only after its citations are known (ADR-0003) |
| Quota checked when the upload starts | Checked at start with the browser's page count, and checked again at finish with the real count | The page count isn't known on the server until the upload ends |
| Map extraction through the Message Batches API | Direct calls in the MVP | A batch result can take a long time to arrive, and waiting inside a task adds complexity. Direct calls cost about 2 USD more per 3,600-page case file; we can add batches behind the same port later. |
| Layered folders (`core` use cases, `adapters`, `db` as separate packages) | One `core` package organized by module | Changes stay inside one module folder instead of touching three layers |
