import { AsyncLocalStorage } from "node:async_hooks";
import { CaseFile } from "../../case-files";
import type { CaseFileProps, CaseFileRepository } from "../../case-files";
import type { LawyerPlan, MeteringRepository, QuotaCharge } from "../../metering";
import type { CaseFileId, LawyerId } from "../../shared";
import type { Repositories, UnitOfWork } from "../unit-of-work";

/** The in-memory tables. Tests may seed rows that no repository method writes yet. */
export type InMemoryState = {
  caseFiles: Map<CaseFileId, CaseFileProps>;
  metering: {
    plans: Map<LawyerId, LawyerPlan>;
    charges: { lawyer: LawyerId; caseFileId: CaseFileId | null; pages: number; createdAt: Date }[];
  };
};

/**
 * Keeps every repository's rows in memory. A run copies the state first and puts
 * the copy back if the work throws. Runs are not isolated from each other, so
 * concurrency (row locks) is tested only on Postgres.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  state: InMemoryState = { caseFiles: new Map(), metering: { plans: new Map(), charges: [] } };
  private readonly inRun = new AsyncLocalStorage<true>();
  private readonly repos: Repositories = {
    caseFiles: new InMemoryCaseFileRepository(() => this.state),
    metering: new InMemoryMeteringRepository(() => this.state),
  };

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

class InMemoryCaseFileRepository implements CaseFileRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async find(lawyer: LawyerId, id: CaseFileId) {
    const props = this.state().caseFiles.get(id);
    return props?.lawyer === lawyer ? CaseFile.restore(props) : null;
  }

  async listOf(lawyer: LawyerId) {
    return [...this.state().caseFiles.values()]
      .filter((props) => props.lawyer === lawyer)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((props) => CaseFile.restore(props));
  }

  async save(caseFile: CaseFile) {
    this.state().caseFiles.set(caseFile.id, caseFile.snapshot());
  }
}

class InMemoryMeteringRepository implements MeteringRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async findPlan(lawyer: LawyerId) {
    return this.state().metering.plans.get(lawyer) ?? null;
  }

  /** Nothing runs at the same time in memory, so there is nothing to lock. */
  async lockPlan(lawyer: LawyerId) {
    return this.findPlan(lawyer);
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

  async isCharged(caseFileId: CaseFileId) {
    return this.state().metering.charges.some((charge) => charge.caseFileId === caseFileId);
  }

  async insertCharge({ lawyer, caseFileId, pages }: QuotaCharge) {
    if (await this.isCharged(caseFileId)) return;
    this.state().metering.charges.push({ lawyer, caseFileId, pages, createdAt: new Date() });
  }
}
