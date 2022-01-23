import fetch from 'node-fetch';
import * as R from 'ramda';

import { randomInt } from '../util.js';

const buildLink = (id: string) => `https://ameo.link/u/${id}.png`;

export const getRandomAmeoLink = async (minIndex = 0, maxIndex = 10000): Promise<string> => {
  const val = await R.range(0, 20).reduce(
    (acc: Promise<string | undefined>): Promise<undefined | string> =>
      acc.then(async val => {
        if (!!val) {
          return val;
        }

        const id = randomInt(minIndex, maxIndex).toString(36);
        const url = buildLink(id);
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (!res.ok) {
            throw new Error();
          }
          return url;
        } catch (err) {
          return undefined;
        }
      }),
    Promise.resolve(undefined) as Promise<undefined | string>
  );

  if (!val) {
    return 'Failed to find a valid Ameo link in 20 tries... You must be very unlucky.';
  }
  return val;
};
