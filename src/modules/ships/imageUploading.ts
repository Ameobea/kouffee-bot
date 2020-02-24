import crypto from 'crypto';

import { Storage } from '@google-cloud/storage';

import { CONF } from 'src/conf';

const storage = new Storage();

const buildImageURL = (fileName: string) =>
  `https://storage.googleapis.com/${CONF.ships.google_cloud.images_bucket_name}/${fileName}`;

export const uploadImage = async (content: Buffer): Promise<string> => {
  const hash = crypto.createHash('sha256');
  const digest = hash
    .update(content)
    .digest()
    .toString('hex');
  const fileName = `${digest}.png`;

  const bucket = storage.bucket(CONF.ships.google_cloud.images_bucket_name);

  if (await bucket.file(fileName).exists()) {
    return buildImageURL(fileName);
  }

  return new Promise((resolve, reject) =>
    bucket
      .file(fileName)
      .createWriteStream({
        metadata: {
          contentType: 'image/png',
        },
      })
      .on('error', (err: any) => reject(err))
      .on('finish', () => resolve(buildImageURL(fileName)))
      .end(content)
  );
};
