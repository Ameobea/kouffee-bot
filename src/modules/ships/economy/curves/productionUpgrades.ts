import { Production, Balances } from 'src/modules/ships/economy';
import { BuildableShip } from 'src/modules/ships/fleet';
import { mkExpoCurve } from '.';

export const ProductionUpgradeCostGetters: {
  [K in keyof Production]: (curTier: number) => { cost: Balances; timeMs: number };
} = {
  tier1: (curTier: number) => ({
    cost: {
      tier1: mkExpoCurve(800, 1.60409, 0.4)(curTier) - 800,
      tier2: mkExpoCurve(400, 1.60409, 0.4)(curTier) - 400,
      tier3: 0,
      special1: 0,
    },
    timeMs: mkExpoCurve(60 * 1000, 1.31409, 0.64)(curTier) - 60 * 1000,
  }),
  tier2: (curTier: number) => ({
    cost: {
      tier1: mkExpoCurve(400, 1.60409, 0.4)(curTier) - 400,
      tier2: mkExpoCurve(800, 1.60409, 0.4)(curTier) - 800,
      tier3: 0,
      special1: 0,
    },
    timeMs: mkExpoCurve(60 * 1000, 1.31409, 0.64)(curTier) * 1.2 - 60 * 1000,
  }),
  tier3: (curTier: number) => ({
    cost: {
      tier1: mkExpoCurve(550, 1.60409, 0.4)(curTier) - 550,
      tier2: mkExpoCurve(550, 1.60409, 0.4)(curTier) - 550,
      tier3: mkExpoCurve(800, 1.60409, 0.4)(curTier) - 800,
      special1: 0,
    },
    timeMs: mkExpoCurve(60 * 1000, 1.31409, 0.64)(curTier) * 1.6 - 60 * 1000,
  }),
};

export const ShipProductionCostGetters: {
  [K in BuildableShip]: { cost: Balances; timeMs: number };
} = {
  ship1: { cost: { tier1: 2500, tier2: 1000, tier3: 0, special1: 0 }, timeMs: 60 * 2 * 1000 },
  ship2: { cost: { tier1: 3000, tier2: 3000, tier3: 500, special1: 0 }, timeMs: 60 * 2 * 1000 },
  ship3: { cost: { tier1: 500, tier2: 5000, tier3: 1000, special1: 100 }, timeMs: 60 * 2 * 1000 },
  shipSpecial1: {
    cost: { tier1: 500000, tier2: 250000, tier3: 250000, special1: 500 },
    timeMs: 60 * 60 * 12 * 1000,
  },
};
