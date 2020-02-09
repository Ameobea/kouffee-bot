import { Image } from 'canvas';

export function generateHexColorForCashStack(coins: number) {
  if (coins > 9999999) {
    return '#00FF80';
  }

  if (coins > 99999) {
    return '#FFFFFF';
  }

  return '#FFFF00';
}

export function canvasImageFromBuffer(imageBuffer: Buffer): Promise<Image> {
  return new Promise((resolve, reject) => {
    const canvasImage = new Image();

    canvasImage.onload = () => resolve(canvasImage);
    canvasImage.onerror = () => reject(new Error('Failed to load image.'));
    canvasImage.src = imageBuffer;
  });
}

export function formatItemStackQuantity(quantity: number) {
  if (quantity > 9999999) {
    return `${Math.floor(quantity / 1000000)}M`;
  } else if (quantity > 99999) {
    return `${Math.floor(quantity / 1000)}K`;
  } else {
    return quantity.toString();
  }
}

export function cleanString(str: string) {
  return str.replace(/[^0-9a-zA-Z]/gi, '').toUpperCase();
}

export function saveCtx(ctx: any) {
  let props = [
    'strokeStyle',
    'fillStyle',
    'globalAlpha',
    'lineWidth',
    'lineCap',
    'lineJoin',
    'miterLimit',
    'lineDashOffset',
    'shadowOffsetX',
    'shadowOffsetY',
    'shadowBlur',
    'shadowColor',
    'globalCompositeOperation',
    'font',
    'textAlign',
    'textBaseline',
    'direction',
    'imageSmoothingEnabled',
  ];
  let state: { [key: string]: any } = {};
  for (const prop of props) {
    state[prop] = ctx[prop];
  }
  return state;
}

export function restoreCtx(ctx: any, state: any) {
  for (const prop in state) {
    ctx[prop] = state[prop];
  }
}
