/**
 * Pick a random movie fron a list
 */

import mysql from 'mysql';

import { query, insert, _delete } from 'src/dbUtil';

export const pickMovie = async (conn: mysql.Pool | mysql.PoolConnection) =>
  (
    await query<{ name: string }>(conn, `SELECT * FROM \`movies\` WHERE 1 ORDER BY RAND() LIMIT 1;`)
  ).map(({ name }) => `WATCH: ${name}`)[0];

export const addMovie = async (conn: mysql.Pool | mysql.PoolConnection, name: string) =>
  insert(conn, `INSERT INTO \`movies\` (name) VALUES (?);`, [name]);

export const deleteMovie = async (conn: mysql.Pool | mysql.PoolConnection, name: string) =>
  _delete(conn, `DELETE FROM \`movies\` WHERE name = ?;`, [name]);
