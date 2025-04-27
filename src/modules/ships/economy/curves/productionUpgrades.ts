import { Production, Balances } from '@src/modules/ships/economy/index.js';
import { BuildableShip } from '@src/modules/ships/fleet/index.js';
import { mkExpoCurve } from './index.js';

export const ProductionUpgradeCostGetters: {
  [K in keyof Production]: (curTier: number) => { cost: Balances; timeMs: number };
} = {
  tier1: (curTier: number) => ({
    cost: {
      tier1: mkExpoCurve(800, 1.60409, 0.4)(curTier) - 800n,
      tier2: mkExpoCurve(400, 1.60409, 0.4)(curTier) - 400n,
      tier3: 0n,
      special1: 0n,
    },
    timeMs: Number(mkExpoCurve(60 * 1000, 1.31409, 0.64)(curTier) - 60n * 1000n),
  }),
  tier2: (curTier: number) => ({
    cost: {
      tier1: mkExpoCurve(400, 1.60409, 0.4)(curTier) - 400n,
      tier2: mkExpoCurve(800, 1.60409, 0.4)(curTier) - 800n,
      tier3: 0n,
      special1: 0n,
    },
    timeMs: Number(mkExpoCurve(60 * 1000, 1.31409, 0.64)(curTier)) * 1.2 - 60 * 1000,
  }),
  tier3: (curTier: number) => ({
    cost: {
      tier1: mkExpoCurve(550, 1.60409, 0.4)(curTier) - 550n,
      tier2: mkExpoCurve(550, 1.60409, 0.4)(curTier) - 550n,
      tier3: mkExpoCurve(800, 1.60409, 0.4)(curTier) - 800n,
      special1: 0n,
    },
    timeMs: Number(mkExpoCurve(60 * 1000, 1.31409, 0.64)(curTier)) * 1.6 - 60 * 1000,
  }),
};

export const ShipProductionCostGetters: {
  [K in BuildableShip]: { cost: Balances; timeMs: number };
} = {
  ship1: {
    cost: { tier1: 2500n, tier2: 1000n, tier3: 0n, special1: 0n },
    timeMs: 60 * 2 * 1000,
  },
  ship2: {
    cost: { tier1: 3000n, tier2: 3000n, tier3: 500n, special1: 0n },
    timeMs: 60 * 2 * 1000,
  },
  ship3: {
    cost: { tier1: 500n, tier2: 5000n, tier3: 1000n, special1: 100n },
    timeMs: 60 * 2 * 1000,
  },
  shipSpecial1: {
    cost: { tier1: 500000n, tier2: 250000n, tier3: 250000n, special1: 500n },
    timeMs: 60 * 60 * 12 * 1000,
  },
};
