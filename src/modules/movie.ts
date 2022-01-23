/**
 * Pick a random movie fron a list
 */

import mysql from 'mysql';

import { query, insert, _delete, update } from '@src/dbUtil.js';

export const pickMovie = async (conn: mysql.Pool | mysql.PoolConnection) =>
  (
    await query<{ name: string }>(
      conn,
      `SELECT * FROM \`movies\` WHERE watched = 0 ORDER BY RAND() LIMIT 1;`
    )
  ).map(({ name }) => `WATCH: ${name}`)[0];

export const addMovie = async (conn: mysql.Pool | mysql.PoolConnection, name: string) =>
  insert(conn, `INSERT INTO \`movies\` (name) VALUES (?);`, [name]);

export const hasMovie = async (conn: mysql.Pool | mysql.PoolConnection, name: string) =>
  (await query<{ name: string }>(conn, `SELECT * from \`movies\` where name = ? LIMIT 1;`, [name]))
    .length > 0;

export const deleteMovie = async (conn: mysql.Pool | mysql.PoolConnection, name: string) =>
  _delete(conn, `DELETE FROM \`movies\` WHERE name = ?;`, [name]);

export const setMovieWatched = async (
  conn: mysql.Pool | mysql.PoolConnection,
  name: string,
  isWatched: boolean
) =>
  update(conn, `UPDATE \`movies\` SET watched = ? WHERE name = ?`, [isWatched ? 1 : 0, name]).then(
    res => res.changedRows > 0
  );

export const listMovies = async (conn: mysql.Pool | mysql.PoolConnection) =>
  query<{ name: string; watched: number }>(conn, `SELECT * FROM \`movies\` WHERE 1;`).then(movies =>
    movies.map(({ name, watched }) => (watched ? `~~${name}~~` : name)).join('\n')
  );
