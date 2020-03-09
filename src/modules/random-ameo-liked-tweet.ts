/**
 * Prints the URL to a random tweet that I liked at some point
 */

import mysql from 'mysql';
import { query } from 'src/dbUtil';

export const getRandomLikedTweetURL = async (conn: mysql.PoolConnection | mysql.Pool) => {
  const res = await query<{ tweet_id: string }>(
    conn,
    'SELECT tweet_id from `liked_tweets` ORDER BY RAND() LIMIT 1;'
  );
  return `https://twitter.com/i/status/${res[0].tweet_id}`;
};
