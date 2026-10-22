import { AsyncLocalStorage } from "node:async_hooks";
import type { Repositories, UnitOfWork } from "../../ports";
import type { Db } from "../index";
import { DrizzleCaseFileRepository } from "./case-files";
import { DrizzleIngestionRepository } from "./ingestion";
import { DrizzleMeteringRepository } from "./metering";

/**
 * Runs work in a Postgres transaction. The open transaction's repositories live in
 * async context, so a run inside a run joins it instead of opening a second one.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private readonly current = new AsyncLocalStorage<Repositories>();

  constructor(private readonly db: Db) {}

  run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    const repos = this.current.getStore();
    if (repos) return work(repos);
    return this.db.transaction((tx) => {
      const txRepos = repositoriesFor(tx);
      return this.current.run(txRepos, () => work(txRepos));
    });
  }
}

function repositoriesFor(db: Db): Repositories {
  return {
    caseFiles: new DrizzleCaseFileRepository(db),
    ingestion: new DrizzleIngestionRepository(db),
    metering: new DrizzleMeteringRepository(db),
  };
}
