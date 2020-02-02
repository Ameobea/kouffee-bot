import { mkExpoCurve } from '.';
import { Production } from '..';

export const ProductionIncomeGetters: {
  [K in keyof Production]: (curTier: number, durationMs: number) => number;
} = {
  tier1: (curTier: number, durationMs: number) =>
    mkExpoCurve(1.0, 1.303409, 0.420103)(curTier) * (durationMs / 1000),
  tier2: (curTier: number, durationMs: number) =>
    mkExpoCurve(0.8, 1.303409, 0.420103)(curTier) * (durationMs / 1000),
  tier3: (curTier: number, durationMs: number) =>
    mkExpoCurve(0.6, 1.303409, 0.420103)(curTier) * (durationMs / 1000),
};
