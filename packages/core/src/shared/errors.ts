/** Base class for errors a caller is expected to handle. */
export class DomainError extends Error {
  override name = "DomainError";
}

/** The lawyer's page quota can't cover this case file. */
export class QuotaExceeded extends DomainError {
  override name = "QuotaExceeded";
  constructor(
    readonly pagesNeeded: number,
    readonly pagesLeft: number,
  ) {
    super(`Case file needs ${pagesNeeded} pages; ${pagesLeft} left this month.`);
  }
}

/** The thing doesn't exist, or the lawyer doesn't own it. Both cases look the same to the caller. */
export class NotFound extends DomainError {
  override name = "NotFound";
}

/** The case file is in a status that doesn't allow this action. */
export class InvalidStatus extends DomainError {
  override name = "InvalidStatus";
}

/** A page range must start at page 1 or later and must not end before it starts. */
export class InvalidPageRange extends DomainError {
  override name = "InvalidPageRange";
  constructor(first: number, last: number) {
    super(`Pages ${first} to ${last} are not a valid page range.`);
  }
}

/** A case file must have from 1 to 5,000 pages. */
export class InvalidPageCount extends DomainError {
  override name = "InvalidPageCount";
  constructor(readonly pages: number) {
    super(`A case file of ${pages} pages is not accepted.`);
  }
}

/** A case file must have from 1 byte to 500 MB. */
export class InvalidFileSize extends DomainError {
  override name = "InvalidFileSize";
  constructor(readonly bytes: number) {
    super(`A case file of ${bytes} bytes is not accepted.`);
  }
}

/** Placeholder for module methods that the build sequence hasn't reached yet. */
export class NotImplemented extends Error {
  override name = "NotImplemented";
  constructor(what: string) {
    super(`${what} is not implemented yet.`);
  }
}

/** A billing webhook whose signature doesn't match its payload: it didn't come from the payment provider. */
export class InvalidWebhook extends DomainError {
  override name = "InvalidWebhook";
}
