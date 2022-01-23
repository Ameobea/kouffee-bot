import eris from 'eris';
import mysql from 'mysql';
import * as R from 'ramda';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Option } from 'funfix-core';
import numeral from 'numeral';

import { CONF } from '../../conf.js';
import { query, update, insert, getConn, commit, dbNow } from '../../dbUtil.js';

dayjs.extend(relativeTime);

const addClaim = async (conn: mysql.PoolConnection, userId: string) => {
  await insert(conn, 'INSERT IGNORE INTO economy_balances (user_id, balance) VALUES (?, ?);', [
    userId,
    0,
  ]);
  await update(conn, 'UPDATE economy_balances SET balance = balance + ? WHERE user_id = ?;', [
    CONF.economy.claim_amount,
    userId,
  ]);
};

export const claimDaily = async (pool: mysql.Pool, user: eris.User): Promise<string> => {
  const now = dayjs(await dbNow(pool));
  const claimInterval = CONF.economy.daily_claim_interval_seconds;

  const res = await query<{ user_id: number; last_claim_timestamp: Date }>(
    pool,
    'SELECT * FROM economy_dailies WHERE user_id = ?;',
    [user.id]
  );
  if (R.isEmpty(res)) {
    await query(
      pool,
      'INSERT IGNORE INTO economy_dailies (user_id, last_claim_timestamp) VALUES (?, NOW());',
      [user.id]
    );
  } else {
    const lastClaimTime = dayjs(res[0]!.last_claim_timestamp);
    const secondsSinceLastClaim = now.diff(lastClaimTime, 'second');

    if (secondsSinceLastClaim < claimInterval) {
      const canClaimAtTime = lastClaimTime.add(CONF.economy.daily_claim_interval_seconds, 'second');
      let timeRemaining = now.to(canClaimAtTime);
      if (timeRemaining.startsWith('in a few seconds')) {
        timeRemaining = `${now.diff(canClaimAtTime, 'second')} seconds`;
      }
      return `Can't claim yet; need to wait: ${timeRemaining}`;
    }
  }

  const conn = await getConn(pool);
  return new Promise(resolve => {
    conn.beginTransaction(async err => {
      if (err) {
        throw err;
      }

      const res2 = await update(
        pool,
        'UPDATE economy_dailies SET last_claim_timestamp = NOW() WHERE user_id = ?',
        [user.id]
      );
      if (res2.changedRows < 1) {
        console.warn(
          `Claiming failed to update for user id ${user.id}; possible race condition... retrying.`
        );
        await commit(conn);
        return claimDaily(pool, user);
      }

      await addClaim(conn, user.id);
      await commit(conn);

      conn.release();
      resolve(`Successfully claimed ${CONF.economy.claim_amount} ${CONF.economy.currency_name}.`);
    });
  });
};

export const getBalance = async (pool: mysql.Pool, userId: string): Promise<string> => {
  const [row] = await query<{ user_id: number; balance: number }>(
    pool,
    'SELECT * FROM economy_balances WHERE user_id = ?;',
    [userId]
  );
  if (R.isNil(row)) {
    insert(pool, 'INSERT IGNORE INTO economy_balances (user_id, balance) VALUES (?, 0);', [userId]);
  }

  const balance = Option.of(row).map(R.prop('balance')).getOrElse(0);
  return `${numeral(balance).format('1,000')} ${CONF.economy.currency_name}`;
};

export const getTopBalances = async (pool: mysql.Pool): Promise<string> => {
  // TODO
  return 'TODO';
};
