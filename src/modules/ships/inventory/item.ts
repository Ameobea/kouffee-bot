import path from 'path';
import fs from 'fs';
import YAML from 'yaml';

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
  count: number;
  tier?: Tier;
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
    const allItems: ItemDefinition[] = YAML.parse(fileContent);

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
