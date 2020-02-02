import * as R from 'ramda';
import { ProductionIncomeGetters } from './curves/production';
import { filterNils } from 'ameo-utils/dist/util';

export interface Balances {
  tier1: number;
  tier2: number;
  tier3: number;
  special1: number;
}

export const addBalances = (bal1: Balances, bal2: Balances): Balances => ({
  tier1: bal1.tier1 + bal2.tier1,
  tier2: bal1.tier2 + bal2.tier2,
  tier3: bal1.tier3 + bal2.tier3,
  special1: bal1.special1 + bal2.special1,
});

export const subtractBalances = (bal1: Balances, bal2: Balances): Balances => ({
  tier1: bal1.tier1 - bal2.tier1,
  tier2: bal1.tier2 - bal2.tier2,
  tier3: bal1.tier3 - bal2.tier3,
  special1: bal1.special1 - bal2.special1,
});

/**
 * Returns the names of all resources that are of insufficient quantities to fulfill `cost`.
 */
export const getHasSufficientBalance = (cost: Balances, balances: Balances): string[] | null => {
  const missingNames = filterNils(
    Object.entries(balances).map(([key, val]: [keyof Balances, number]) =>
      cost[key] > val ? key : null
    )
  );
  return R.isEmpty(missingNames) ? null : missingNames;
};

export const buildEmptyBalances = (): Balances => ({ tier1: 0, tier2: 0, tier3: 0, special1: 0 });

export const buildDefaultBalances = (): Balances => ({
  tier1: 2000,
  tier2: 1000,
  tier3: 200,
  special1: 0,
});

export interface Production {
  tier1: number;
  tier2: number;
  tier3: number;
}

export enum ProductionJobType {
  UpdgradeProduction,
}

interface ProductionJobBase {
  startTime: Date;
  endTime: Date;
}

export type ProductionJob = ProductionJobBase & {
  jobType: ProductionJobType;
  productionType: keyof Production;
};

export const buildDefaultProduction = (): Production => ({ tier1: 1, tier2: 1, tier3: 1 });

const computeIncome = (production: Production, durationMs: number): Balances => ({
  ...buildEmptyBalances(),
  tier1: ProductionIncomeGetters.tier1(production.tier1, durationMs),
  tier2: ProductionIncomeGetters.tier2(production.tier2, durationMs),
  tier3: ProductionIncomeGetters.tier3(production.tier3, durationMs),
});

export const computeLiveUserProductionAndBalances = (
  now: Date,
  checkpointTime: Date,
  balances: Balances,
  production: Production,
  productionJobsEndingAfterCheckpointTime: ProductionJob[]
): { balances: Balances; production: Production } => {
  const nowTime = now.getTime();

  // Make sure we apply production jobs in the correct order
  const sortedJobs = R.sortBy<ProductionJob>(
    R.prop('endTime'),
    productionJobsEndingAfterCheckpointTime
  );

  // We only care about production jobs that are finished
  const finishedProductionJobs = sortedJobs.filter(job => job.endTime.getTime() <= nowTime);

  // Process production for each segment between upgrades
  const {
    balances: newBalances,
    production: newProduction,
    startTime: endTime,
  } = finishedProductionJobs.reduce(
    ({ startTime, production, balances }, job) => {
      const endTime = job.endTime.getTime();
      const segmentDurationMs = endTime - startTime;

      const balancesForSegment: Balances = computeIncome(production, segmentDurationMs);

      return {
        startTime: endTime,
        production: { ...production, [job.productionType]: production[job.productionType] + 1 },
        balances: addBalances(balances, balancesForSegment),
      };
    },
    {
      startTime: checkpointTime.getTime(),
      balances,
      production,
    }
  );

  // Process the final period between the last production upgrade and the current time
  const lastSegmentDurationMs = nowTime - endTime;
  const lastSegmentIncome = computeIncome(newProduction, lastSegmentDurationMs);

  return { balances: addBalances(newBalances, lastSegmentIncome), production: newProduction };
};
