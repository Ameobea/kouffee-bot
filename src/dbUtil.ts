import mysql from 'mysql';
import dayjs from 'dayjs';

export const query = async <T>(
  conn: mysql.Pool | mysql.PoolConnection,
  query: string,
  values?: any[]
): Promise<T[]> =>
  new Promise((resolve, reject) =>
    conn.query(query, values, (err, res) => {
      if (!!err) {
        reject(err);
        return;
      }

      resolve(res as T[]);
    })
  );

export const update = (
  conn: mysql.Pool | mysql.PoolConnection,
  query: string,
  values?: any[]
): Promise<{ fieldCount: number; affectedRows: number; message: string; changedRows: number }> =>
  new Promise((resolve, reject) =>
    conn.query(query, values, (err, res) => {
      if (!!err) {
        reject(err);
        return;
      }

      resolve(res);
    })
  );

export const insert = (
  conn: mysql.Pool | mysql.PoolConnection,
  query: string,
  values: any[]
): Promise<unknown> =>
  new Promise((resolve, reject) =>
    conn.query(query, values, (err, res) => {
      if (!!err) {
        reject(err);
        return;
      }

      resolve(res);
    })
  );

export const getConn = (pool: mysql.Pool): Promise<mysql.PoolConnection> =>
  new Promise((resolve, reject) =>
    pool.getConnection((err, res) => {
      if (!!err) {
        reject(err);
        return;
      }

      resolve(res);
    })
  );

export const rollback = (conn: mysql.PoolConnection): Promise<void> =>
  new Promise((resolve, reject) =>
    conn.rollback(err => {
      if (!!err) {
        reject(err);
      } else {
        resolve();
      }
    })
  );

export const commit = (conn: mysql.PoolConnection): Promise<void> =>
  new Promise((resolve, reject) =>
    conn.commit(async err => {
      if (!!err) {
        await rollback(conn);
        reject(err);
      } else {
        resolve();
      }
    })
  );

export const dbNow = async (conn: mysql.Pool | mysql.PoolConnection) =>
  query<{ 'NOW()': number }>(conn, 'SELECT NOW();').then(rows => dayjs(rows[0]!['NOW()']).toDate());
