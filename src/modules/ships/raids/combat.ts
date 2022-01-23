import { Fleet } from '../fleet/index.js';
import { RaidLocation, RaidDurationTier } from './types.js';

export const maybeDoCombat = async ({
  location,
  duration,
  fleet,
}: {
  location: RaidLocation;
  duration: RaidDurationTier;
  fleet: Fleet;
}): Promise<Fleet | null> => {
  // TODO
  return null;
};
