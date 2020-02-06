import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import { parse } from '@ctrl/golang-template';
import { Option } from 'funfix-core';

import { CONF } from 'src/conf';

export enum Tier {
  Tier1,
  Tier2,
  Tier3,
  Tier4,
  Tier5,
  Tier6,
}

export interface ItemDefinition {
  id: number;
  name: string;
  description?: string;
  isTiered?: boolean;
  imageURL?: string | null;
}

export interface Item {
  id: number;
  count: bigint;
  tier?: Tier | null;
  metadata?: any;
}

export const ITEMS_BY_ID: Map<number, ItemDefinition> = new Map();

export const initItemData = async () => {
  const fileContent = await new Promise<string>((resolve, reject) =>
    fs.readFile(
      path.join(__dirname, '../../../../../src/modules/ships/inventory/items.yml'),
      'utf8',
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(data);
      }
    )
  );

  try {
    const allItems: ItemDefinition[] = YAML.parse(fileContent).map(
      (def: ItemDefinition): ItemDefinition => ({
        ...def,
        // The `name` and `description` fields can be templated, using the global app config object as input.
        //
        // They are templated using golang's templating scheme.
        name: parse(def.name, CONF),
        description: Option.of(def.description)
          .map(description => parse(description, CONF))
          .orUndefined(),
      })
    );

    allItems.forEach(itemDef => {
      if (ITEMS_BY_ID.has(itemDef.id)) {
        throw new Error(`Multiple entries for item id "${itemDef.id}"`);
      }
      ITEMS_BY_ID.set(itemDef.id, itemDef);
    });
  } catch (err) {
    console.error('Failed to parse `items.yml` file: ', err);
    process.exit(1);
  }

  return ITEMS_BY_ID;
};
