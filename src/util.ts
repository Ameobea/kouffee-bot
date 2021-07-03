import * as path from 'path';

export const randomInt = (lowerBound: number, upperBound: number): number =>
  lowerBound + Math.floor(Math.random() * (upperBound - lowerBound + 1));

export const timeout = async (timeoutMs: number) =>
  new Promise(resolve => setTimeout(resolve, timeoutMs));

export const getBaseDir = () => path.join(__dirname, '../..');

export const replaceAll = (haystack: string, from: string, to: string) => {
  let cur = haystack;
  while (true) {
    const replaced = cur.replace(from, to);
    if (replaced !== cur) {
      cur = replaced;
    } else {
      return replaced;
    }
  }
};

export const deJoqify = (content: string, senderUserId?: string | number) =>
  replaceAll(content, '<@!165985005200211969>', senderUserId ? `<@!${senderUserId}>` : ' ');

export const btoa = (s: string) => Buffer.from(s).toString('base64');
