import mysql from 'mysql';

import { insert, query } from 'src/dbUtil';
import { randomInt } from 'src/util';

export const archivePost = async (content: string, userID: string, pool: mysql.Pool) => {
  await insert(pool, 'INSERT INTO `archived_posts` (content, user_id) VALUES (?, ?);', [
    content,
    userID,
  ]);
};

export const getRandomArchivedPost = async (pool: mysql.Pool) => {
  const { count: archivedPostCount } = (
    await query<{ count: string }>(pool, 'SELECT COUNT(*) as count FROM `archived_posts`;')
  )[0];
  const ix = randomInt(0, +archivedPostCount);
  const post = (
    await query<{ content: string }>(
      pool,
      'SELECT content FROM `archived_posts` ORDER BY `id` ASC LIMIT 1 OFFSET ?;',
      [ix]
    )
  )[0];
  return post?.content;
};
