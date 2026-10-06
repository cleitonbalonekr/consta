import { AsyncLocalStorage } from "node:async_hooks";
import type { LawyerPlan, MeteringRepository } from "../../metering";
import type { LawyerId } from "../../shared";
import type { Repositories, UnitOfWork } from "../unit-of-work";

/** The in-memory tables. Tests may seed rows that no repository method writes yet. */
export type InMemoryState = {
  metering: {
    plans: Map<LawyerId, LawyerPlan>;
    charges: { lawyer: LawyerId; pages: number; createdAt: Date }[];
  };
};

/**
 * Keeps every repository's rows in memory. A run copies the state first and puts
 * the copy back if the work throws. Runs are not isolated from each other, so
 * concurrency (row locks) is tested only on Postgres.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  state: InMemoryState = { metering: { plans: new Map(), charges: [] } };
  private readonly inRun = new AsyncLocalStorage<true>();
  private readonly repos: Repositories = { metering: new InMemoryMeteringRepository(() => this.state) };

  async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    if (this.inRun.getStore()) return work(this.repos);
    const before = structuredClone(this.state);
    try {
      return await this.inRun.run(true, () => work(this.repos));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

class InMemoryMeteringRepository implements MeteringRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async findPlan(lawyer: LawyerId) {
    return this.state().metering.plans.get(lawyer) ?? null;
  }

  async insertPlanIfMissing(lawyer: LawyerId, plan: LawyerPlan) {
    const { plans } = this.state().metering;
    if (!plans.has(lawyer)) plans.set(lawyer, { ...plan });
  }

  async pagesChargedSince(lawyer: LawyerId, since: Date) {
    return this.state()
      .metering.charges.filter((charge) => charge.lawyer === lawyer && charge.createdAt >= since)
      .reduce((pages, charge) => pages + charge.pages, 0);
  }
}
