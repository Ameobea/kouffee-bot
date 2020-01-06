import fs from 'fs';

import toml from 'toml';

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
  } catch (err) {
    console.error('Failed to parse conf file: ', err);
    process.exit(1);
  }
};
