import { mkExpoCurve } from '.';
import { Production } from '..';

export const ProductionIncomeGetters: {
  [K in keyof Production]: (curTier: number, durationMs: number) => bigint;
} = {
  tier1: (curTier: number, durationMs: number) =>
    BigInt(
      Math.round(
        0.4 * curTier * Number(mkExpoCurve(1.0, 1.203409, 0.380103)(curTier)) * (durationMs / 1000)
      )
    ),
  tier2: (curTier: number, durationMs: number) =>
    BigInt(
      Math.round(
        0.4 * curTier * Number(mkExpoCurve(0.6, 1.203409, 0.380103)(curTier)) * (durationMs / 1000)
      )
    ),
  tier3: (curTier: number, durationMs: number) =>
    BigInt(
      Math.round(
        0.4 * curTier * Number(mkExpoCurve(0.3, 1.203409, 0.380103)(curTier)) * (durationMs / 1000)
      )
    ),
};
