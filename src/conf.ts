import fs from 'fs';

import toml from 'toml';
import { Balances } from './modules/ships/economy';
import { Fleet } from './modules/ships/fleet';
import { Tier } from './modules/ships/inventory/item';
import { RaidLocation } from './modules/ships/raids';

export interface DatabaseConf {
  host: string;
  username: string;
  password: string;
  database: string;
}

export interface EconomyConf {
  daily_claim_interval_seconds: number;
  claim_amount: number;
  currency_name: string;
}

export interface GeneralConf {
  command_symbol: string;
}

export interface Conf {
  general: GeneralConf;
  database: DatabaseConf;
  economy: EconomyConf;
  ships: ShipsConf;
}

export let CONF: Conf = null as any;

export const loadConf = async () => {
  const fileContent = await new Promise<string>((resolve, reject) =>
    fs.readFile('./conf.toml', {}, (err, data) => {
      if (!!err) {
        console.error('Failed to read config file: ', err);
        reject(err);
        return;
      }
      resolve(data.toString());
    })
  );

  try {
    CONF = toml.parse(fileContent) as Conf;
    return CONF;
  } catch (err) {
    console.error('Failed to parse conf file: ', err);
    process.exit(1);
  }
};

export interface RaidLocationDescriptor {
  name: string;
  description: string;
}

export interface ShipsConf {
  resource_names: { [K in keyof Balances]: string };
  ship_names: { [K in keyof Fleet]: string };
  tier_names: { [K in Tier]: string };
  raid_location_names: { [K in RaidLocation]: RaidLocationDescriptor };
}
