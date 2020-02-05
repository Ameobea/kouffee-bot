import * as R from 'ramda';

import { Item } from 'src/modules/ships/inventory/item';

export enum RaidLocation {
  Location1,
  Location2,
  Location3,
}

export const getAvailableRaidLocations = async (
  userId: string,
  userInventory: Item[]
): Promise<RaidLocation[]> => {
  const availableRaidLocations = [RaidLocation.Location1];

  if (userInventory.find(R.propEq('id', 2001))) {
    availableRaidLocations.push(RaidLocation.Location1);
  }
  if (userInventory.find(R.propEq('id', 2000))) {
    availableRaidLocations.push(RaidLocation.Location2);
  }

  return availableRaidLocations;
};
