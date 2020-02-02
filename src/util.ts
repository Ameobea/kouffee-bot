export const randomInt = (lowerBound: number, upperBound: number): number =>
  lowerBound + Math.floor(Math.random() * (upperBound - lowerBound + 1));
