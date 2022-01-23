import * as R from 'ramda';

import { Item } from './item.js';

export interface InventoryTransactionRow {
  userId: string;
  applicationTime: Date;
  itemId: number;
  count: bigint;
  metadataKey?: string | null | undefined;
  tier?: number | null | undefined;
}

export const dedupInventory = (items: Item[]): Item[] =>
  items.reduce((acc, item): Item[] => {
    const matchingItemIx = acc.findIndex(
      matchingItem =>
        matchingItem.id === item.id &&
        matchingItem.tier === item.tier &&
        !matchingItem.metadata &&
        !item.metadata
    );

    if (matchingItemIx === -1) {
      return [...acc, R.pick(['id', 'count', 'metadata', 'tier'], item)];
    }

    const matchingItem = acc[matchingItemIx]!;
    matchingItem.count = matchingItem.count + BigInt(item.count);

    if (matchingItem.count === 0n) {
      return R.remove(matchingItemIx, 1, acc);
    }
    return acc;
  }, [] as Item[]);
