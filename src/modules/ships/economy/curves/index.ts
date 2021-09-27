/**
 * Calcs for things like the economy production, upgrade costs, and other things that scale with tier.
 */
export const mkExpoCurve =
  (multiplier: number, base: number, exponentMultiplier = 1) =>
  (level: number): bigint =>
    BigInt(Math.round(multiplier * Math.pow(base, level * exponentMultiplier)));
