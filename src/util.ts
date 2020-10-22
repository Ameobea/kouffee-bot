import * as path from 'path';

export const randomInt = (lowerBound: number, upperBound: number): number =>
  lowerBound + Math.floor(Math.random() * (upperBound - lowerBound + 1));

export const timeout = async (timeoutMs: number) =>
  new Promise(resolve => setTimeout(resolve, timeoutMs));

export const getBaseDir = () => path.join(__dirname, '../..');
