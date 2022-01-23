import mysql from 'mysql';

import { insert, query } from '@src/dbUtil.js';
import { randomInt } from '@src/util.js';

export const archivePost = async (
  content: string,
  userID: string,
  userName: string,
  pool: mysql.Pool,
  channelName: string,
  manuallyTagged: boolean
) => {
  await insert(
    pool,
    `INSERT IGNORE INTO \`${
      manuallyTagged ? 'archived_posts' : 'all_media_posts'
    }\` (content, user_id, user_name, channel_name) VALUES (?, ?, ?, ?);`,
    [content, userID, userName, channelName]
  );
};

export const getRandomArchivedPost = async (pool: mysql.Pool, manuallyTagged: boolean) => {
  const { count: archivedPostCount } = (
    await query<{ count: string }>(
      pool,
      `SELECT COUNT(*) as count FROM \`${manuallyTagged ? 'archived_posts' : 'all_media_posts'}\`;`
    )
  )[0];
  const ix = randomInt(0, +archivedPostCount - 1);
  const post = (
    await query<{
      content: string;
      user_id: string;
      user_name: string;
      channel_name: string;
      stored_at: Date;
    }>(
      pool,
      `SELECT * FROM \`${
        manuallyTagged ? 'archived_posts' : 'all_media_posts'
      }\` ORDER BY \`id\` ASC LIMIT 1 OFFSET ?;`,
      [ix]
    )
  )[0];
  if (!post) {
    return '';
  }

  return `${
    post.user_name === 'unknown' ? post.user_id : post.user_name
  } on ${post.stored_at.toLocaleDateString()}:\n${post.content}`;
};
