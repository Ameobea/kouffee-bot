import { Balances } from 'src/modules/ships/economy';
import { CONF } from 'src/conf';

export const formatInsufficientResourceTypes = (
  insufficientResourceTypes: (keyof Balances)[]
): string =>
  `Insufficient resources of types: ${insufficientResourceTypes
    .map((key: keyof Balances) => CONF.ships.resource_names[key])
    .join(', ')}`;
