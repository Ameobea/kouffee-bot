export const randomInt = (lowerBound: number, upperBound: number): number =>
  lowerBound + Math.floor(Math.random() * (upperBound + 1));
