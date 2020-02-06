import * as R from 'ramda';

import { Item, Tier } from '../inventory/item';
import { RaidLocation } from './types';
import { RaidDurationTier } from '../db';
import { Fleet } from '../fleet';
import { getRaidDurationMS } from '../commands';
import { UnimplementedError } from 'ameo-utils/dist/util';
import { randomInt } from 'src/util';

const RewardMultiplierByDurationTier: { [K in RaidDurationTier]: number } = {
  [RaidDurationTier.Short]: 1.0,
  [RaidDurationTier.Medium]:
    0.7 * (getRaidDurationMS(RaidDurationTier.Medium) / getRaidDurationMS(RaidDurationTier.Short)),
  [RaidDurationTier.Long]:
    0.5 * (getRaidDurationMS(RaidDurationTier.Long) / getRaidDurationMS(RaidDurationTier.Short)),
};

interface LootTableEntry {
  slotCount: number;
  getItems: () => Item[];
}

interface LootTable {
  slots: LootTableEntry[];
  emptySlotCount: number;
  rolls: number;
}

const rollLootTable = (table: LootTable, probabilityMultiplier: number): Item[] => {
  const lootByItemId: Map<number, Item[]> = new Map();

  const totalSlotCount = table.emptySlotCount + R.sum(table.slots.map(R.prop('slotCount')));

  R.times(R.identity, Math.ceil(table.rolls * probabilityMultiplier)).forEach(() => {
    const roll = randomInt(0, totalSlotCount);
    if (roll <= table.emptySlotCount) {
      return;
    }

    let total = 0;
    let normalizedRoll = roll - table.emptySlotCount;
    const slot = table.slots.find(({ slotCount }) => {
      total += slotCount;

      if (normalizedRoll <= total) {
        return true;
      }
      return false;
    })!;
    const items = slot.getItems();
    items.forEach(item => {
      let bucket = lootByItemId.get(item.id);
      if (!bucket) {
        bucket = [];
        lootByItemId.set(item.id, bucket);
      }
      bucket.push(item);
    });
  });

  // Group the items together if they have the same id, tier, and metadata
  return R.unnest(
    [...lootByItemId.values()].map(items =>
      items.reduce((acc, item) => {
        const matchingItemIx = acc.findIndex(
          otherItem =>
            otherItem.id === item.id &&
            otherItem.tier === item.tier &&
            otherItem.metadata === item.metadata
        );
        if (matchingItemIx === -1) {
          return [...acc, item];
        }
        const matchingItem = acc[matchingItemIx];
        matchingItem.count += item.count;
        return acc;
      }, [] as Item[])
    )
  );
};

const LootGettersByLocation: {
  [K in RaidLocation]: (fleet: Fleet, probabilityMultiplier: number) => Item[];
} = {
  [RaidLocation.Location1]: (fleet: Fleet, probabilityMultiplier: number): Item[] => {
    const lootTable: LootTable = {
      rolls: 20,
      emptySlotCount: 60,
      slots: [
        { slotCount: 1, getItems: () => [{ id: 6000, count: 1n }] },
        {
          slotCount: 20,
          getItems: () => {
            // TODO: Make dependant on the size of the fleet or something idk
            const count = randomInt(0, 10);
            return R.times((): Item => {
              const tierRoll = randomInt(0, 100);
              let tier = Tier.Tier1;
              if (tierRoll === 99) {
                tier = Tier.Tier5;
              } else if (tierRoll > 96) {
                tier = Tier.Tier4;
              } else if (tierRoll > 90) {
                tier = Tier.Tier3;
              } else if (tierRoll > 70) {
                tier = Tier.Tier2;
              }
              return { id: 5000, count: 1n, tier };
            }, count);
          },
        },
      ],
    };

    return rollLootTable(lootTable, probabilityMultiplier);
  },
  [RaidLocation.Location2]: (fleet: Fleet, probabilityMultiplier: number): Item[] => {
    throw new UnimplementedError();
  },
  [RaidLocation.Location3]: (fleet: Fleet, probabilityMultiplier: number): Item[] => {
    throw new UnimplementedError();
  },
};

export const rollRaidReward = async ({
  location,
  duration,
  fleet,
}: {
  location: RaidLocation;
  duration: RaidDurationTier;
  fleet: Fleet;
}): Promise<Item[]> => {
  const lootGetter = LootGettersByLocation[location];

  const probabilityMultiplier = RewardMultiplierByDurationTier[duration];

  return lootGetter(fleet, probabilityMultiplier);
};
