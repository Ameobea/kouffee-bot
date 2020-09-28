/**
 * Prints the URL to a random anime girl that I liked at some point
 */

import mysql from 'mysql';
import { query } from 'src/dbUtil';

export const getRandomAnimeGirlURL = async (conn: mysql.PoolConnection | mysql.Pool) =>
  query<{ url: string }>(conn, 'SELECT url from `anime_girls` ORDER BY RAND() LIMIT 1;').then(
    r => r[0].url
  );
