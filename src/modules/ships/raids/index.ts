import * as R from 'ramda';
import { ValueOf } from 'ameo-utils/types';

import { RaidLocation, RaidResult, RaidDurationTier } from './types';
import { Item } from 'src/modules/ships/inventory/item';
import { Fleet } from '../fleet';
import { rollRaidReward } from './loot';
import { maybeDoCombat } from './combat';

const serializeFleet = (fleet: Fleet): { [K in keyof Fleet]: string } =>
  Object.fromEntries(
    Object.entries(fleet)
      .filter(([, val]) => typeof val === 'bigint')
      .map(([key, val]: [keyof Fleet, ValueOf<Fleet>]) => [key, val.toString()])
  ) as { [K in keyof Fleet]: string };

const deserializeFleet = (serializedFleet: { [K in keyof Fleet]: string }): Fleet =>
  (Object.fromEntries(
    Object.entries(serializedFleet).map(([key, val]: [keyof Fleet, string]) => [key, BigInt(val)])
  ) as any) as Fleet;

export const serializeRaidResult = (raidResult: RaidResult): string => {
  const transformed = {
    ...raidResult,
    rewardItems: raidResult.rewardItems.map(item => ({ ...item, count: item.count.toString() })),
    fleet: serializeFleet(raidResult.fleet),
    fleetDiff: raidResult.fleetDiff ? serializeFleet(raidResult.fleetDiff) : null,
  };
  return JSON.stringify(transformed);
};

export const deserializeRaidResult = (serialized: string): RaidResult => {
  const transformed = JSON.parse(serialized);
  return {
    ...transformed,
    rewardItems: transformed.rewardItems.map((item: Item & { count: string }) => ({
      ...item,
      count: BigInt(item.count),
    })),
    fleet: deserializeFleet(transformed.fleet),
    fleetDiff: transformed.fleetDiff ? deserializeFleet(transformed.fleetDiff) : null,
  };
};

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

export const doRaid = async (
  userId: string,
  location: RaidLocation,
  duration: RaidDurationTier,
  fleet: Fleet
): Promise<{ rewardItems: Item[]; fleetDiff: Fleet | null }> => {
  // TODO
  const rewardItems = await rollRaidReward({ location, duration, fleet });
  const fleetDiff = await maybeDoCombat({ location, duration, fleet });
  return { rewardItems, fleetDiff };
};
