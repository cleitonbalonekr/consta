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

/** Placeholder for module methods that the build sequence hasn't reached yet. */
export class NotImplemented extends Error {
  override name = "NotImplemented";
  constructor(what: string) {
    super(`${what} is not implemented yet.`);
  }
}
