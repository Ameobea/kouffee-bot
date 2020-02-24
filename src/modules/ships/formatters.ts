import * as R from 'ramda';
import numeral from 'numeral';
import dayjs, { Dayjs } from 'dayjs';

import { Balances } from 'src/modules/ships/economy';
import { CONF } from 'src/conf';
import { Item, ITEMS_BY_ID } from './inventory/item';
import { FleetJob } from './fleet';
import { RaidDurationTier } from './raids/types';

export const formatInsufficientResourceTypes = (
  insufficientResourceTypes: (keyof Balances)[]
): string =>
  `Insufficient resources of types: ${insufficientResourceTypes
    .map((key: keyof Balances) => CONF.ships.resource_names[key])
    .join(', ')}`;

export const formatInventory = (items: Item[]): string => `\`\`\`
${items
  .map(item => {
    const itemDef = ITEMS_BY_ID.get(item.id);
    if (R.isNil(itemDef)) {
      throw new Error(`No metadata found for item id "${item.id}"`);
    }

    const tierFragment =
      itemDef.isTiered && !R.isNil(item.tier) ? `${CONF.ships.tier_names[item.tier!]} ` : '';

    return `${tierFragment}${itemDef.name}: ${numeral(item.count).format(
      item.count > 10000 ? '1,000a' : '1,000'
    )}`;
  })
  .join('\n')}
\`\`\``;

export const getRaidTimeDurString = (durationTier: RaidDurationTier): string =>
  ({
    [RaidDurationTier.Short]: 'Short',
    [RaidDurationTier.Medium]: 'Medium',
    [RaidDurationTier.Long]: 'Long',
  }[durationTier]);

export const formatFleetJob = (job: FleetJob, now: Dayjs): string =>
  `Construct ${numeral(job.shipCount).format('1,000')} ${
    CONF.ships.ship_names[job.shipType]
  }; Completes ${now.to(dayjs(job.endTime))}`;
