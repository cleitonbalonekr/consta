import type { Plan } from "../shared";

/**
 * Pages a plan allows each month. prd-mvp.md, Monetization: a Trial covers one case file
 * of up to 500 pages; Pro's 5,000 is the worked example of the price rule. Enterprise
 * quotas are set per contract, not here.
 */
export const PAGE_QUOTAS = { trial: 500, pro: 5_000 } as const satisfies Partial<Record<Plan, number>>;
