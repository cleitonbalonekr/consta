import { AsyncLocalStorage } from "node:async_hooks";
import type { Repositories, UnitOfWork } from "../../ports";
import type { Db } from "../index";
import { createDrizzleMeteringRepository } from "./metering";

/**
 * Runs work in a Postgres transaction. The open transaction's repositories live in
 * async context, so a run inside a run joins it instead of opening a second one.
 */
export function createDrizzleUnitOfWork(db: Db): UnitOfWork {
  const current = new AsyncLocalStorage<Repositories>();
  return {
    run(work) {
      const repos = current.getStore();
      if (repos) return work(repos);
      return db.transaction((tx) => {
        const txRepos = repositoriesFor(tx);
        return current.run(txRepos, () => work(txRepos));
      });
    },
  };
}

function repositoriesFor(db: Db): Repositories {
  return { metering: createDrizzleMeteringRepository(db) };
}
