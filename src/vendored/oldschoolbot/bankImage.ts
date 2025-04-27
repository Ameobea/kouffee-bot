import * as R from 'ramda';
import * as _ from 'lodash';
import * as fs from 'fs';
import * as path from 'path';

import canvas from 'canvas';

import {
  generateHexColorForCashStack,
  canvasImageFromBuffer,
  formatItemStackQuantity,
  cleanString,
  saveCtx,
  restoreCtx,
} from './lib/util.js';
import { getBaseDir } from '@src/util.js';
import { Item, ITEMS_BY_ID } from '@src/modules/ships/inventory/item.js';

const { createCanvas, registerFont } = canvas;

registerFont('./src/vendored/oldschoolbot/resources/osrs-font.ttf', { family: 'Regular' });
registerFont('./src/vendored/oldschoolbot/resources/osrs-font-compact.otf', { family: 'Regular' });
registerFont('./src/vendored/oldschoolbot/resources/osrs-font-bold.ttf', { family: 'Regular' });

const bankImageFile = fs.readFileSync('./src/vendored/oldschoolbot/resources/images/bank.png');
const bankRepeaterFile = fs.readFileSync(
  './src/vendored/oldschoolbot/resources/images/repeating.png'
);

const IMAGES_DIR = `${getBaseDir()}/resources/itemImages`;
const spacer = 12;
const itemSize = 32;
const distanceFromTop = 32;
const distanceFromSide = 16;

export default class BankImageTask {
  public itemIconsList: Set<string> = new Set();
  public itemIconImagesCache: Map<string, canvas.Image> = new Map();

  async init() {
    await this.cacheFiles();
  }

  async cacheFiles() {
    // Ensure that the icon dir exists.
    fs.promises.mkdir(IMAGES_DIR).catch(() => null);

    // Get a list of all files (images) in the dir.
    const filesInDir = await fs.promises.readdir(IMAGES_DIR);

    // For each one, set a cache value that it exists.
    for (const fileName of filesInDir) {
      this.itemIconsList.add(path.parse(fileName).name);
    }
  }

  async getItemImage(itemID: number, tier?: number | null): Promise<canvas.Image> {
    const uniqueId = R.isNil(tier) ? itemID.toString() : `${itemID}_${tier + 1}`;
    const isOnDisk = this.itemIconsList.has(uniqueId);
    const cachedImage = this.itemIconImagesCache.get(uniqueId);

    if (!isOnDisk) {
      throw new Error(
        `No image icon for item id ${itemID} tier ${tier}, filename: ${uniqueId}.png`
      );
    }

    if (!cachedImage) {
      const imageBuffer = await fs.promises.readFile(path.join(IMAGES_DIR, `${uniqueId}.png`));
      const image = await canvasImageFromBuffer(imageBuffer);

      this.itemIconImagesCache.set(uniqueId, image);
      return this.getItemImage(itemID, tier);
    }

    return cachedImage;
  }

  async generateBankImage(
    itemLoot: Item[],
    title = '',
    flags: { [key: string]: string | number } = {}
  ): Promise<Buffer> {
    const canvas = createCanvas(488, 331);
    const ctx = canvas.getContext('2d');
    ctx.font = '16px OSRSFontCompact';
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const backgroundImage = await canvasImageFromBuffer(bankImageFile);
    const repeaterImage = await canvasImageFromBuffer(bankRepeaterFile);

    ctx.drawImage(backgroundImage, 0, 0, backgroundImage.width, backgroundImage.height);

    let loot = [];

    for (const item of itemLoot) {
      // Draw value
      const value =
        ITEMS_BY_ID.get(item.id)!.value * Number(item.count) * Math.pow(item.tier || 1, 5);

      loot.push({
        id: item.id,
        quantity: Number(item.count),
        value,
        tier: item.tier,
      });
    }

    // Filtering
    const searchQuery = flags.search || flags.s;
    if (searchQuery && typeof searchQuery === 'string') {
      loot = loot.filter(item => {
        const itemName = ITEMS_BY_ID.get(item.id)!.name;
        return cleanString(itemName).includes(cleanString(searchQuery));
      });
    }

    loot = loot.filter(item => item.quantity > 0);
    if (loot.length === 0) throw 'No items found.';

    // Sorting
    loot = loot.sort((a, b) => b.value - a.value);

    // Paging
    const page = flags.page;
    if (typeof page === 'number') {
      const chunked = _.chunk(loot, 56);
      const pageLoot = chunked[page];
      if (!pageLoot) throw 'You have no items on this page.';
      loot = pageLoot;
    }

    // Draw Bank Title

    ctx.textAlign = 'center';
    ctx.font = '16px RuneScape Bold 12';

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#000000';
      ctx.fillText(title, canvas.width / 2 + 1, 21 + 1);
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#ff981f';
      ctx.fillText(title, canvas.width / 2, 21);
    }

    // Draw Items

    ctx.textAlign = 'start';
    ctx.fillStyle = '#494034';

    ctx.font = '16px OSRSFontCompact';

    const chunkedLoot = _.chunk(loot, 8);

    for (let i = 0; i < chunkedLoot.length; i++) {
      if (i > 6) {
        const state = saveCtx(ctx);
        const temp = ctx.getImageData(0, 0, canvas.width, canvas.height - 10);
        canvas.height += itemSize + (i === chunkedLoot.length ? 0 : spacer);

        const ptrn = ctx.createPattern(repeaterImage, 'repeat');
        ctx.fillStyle = ptrn;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.putImageData(temp, 0, 0);
        restoreCtx(ctx, state);
      }
      for (let x = 0; x < chunkedLoot[i].length; x++) {
        const { id, quantity, tier } = chunkedLoot[i][x];
        const item = await this.getItemImage(id, tier);
        if (!item) continue;

        const xLoc = Math.floor(spacer + x * ((canvas.width - 40) / 8) + distanceFromSide);
        const yLoc = Math.floor(itemSize * (i * 1.22) + spacer + distanceFromTop);

        ctx.drawImage(
          item,
          xLoc + (32 - item.width) / 2,
          yLoc + (32 - item.height) / 2,
          item.width,
          item.height
        );

        const quantityColor = generateHexColorForCashStack(quantity);
        const formattedQuantity = formatItemStackQuantity(quantity);

        ctx.fillStyle = '#000000';
        for (let t = 0; t < 5; t++) {
          ctx.fillText(
            formattedQuantity,
            xLoc + distanceFromSide - 18 + 1,
            yLoc + distanceFromTop - 24 + 1
          );
        }

        ctx.fillStyle = quantityColor;
        for (let t = 0; t < 5; t++) {
          ctx.fillText(
            formattedQuantity,
            xLoc + distanceFromSide - 18,
            yLoc + distanceFromTop - 24
          );
        }
      }
    }

    return canvas.toBuffer();
  }
}
