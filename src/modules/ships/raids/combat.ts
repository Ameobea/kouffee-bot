import { Fleet } from '../fleet';
import { RaidDurationTier } from '../db';
import { RaidLocation } from './types';

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
