import * as R from 'ramda';
import mysql from 'mysql';
import Eris from 'eris';

import { insert, query, _delete } from 'src/dbUtil';
import { CONF } from 'src/conf';

/**
 * Adds the functionality of adding/removing simple custom commands that display text in response to a keyword
 */

export const addCustomCommand = async (
  pool: mysql.Pool,
  command: string,
  response: string,
  userId: string
) => {
  try {
    await insert(
      pool,
      'INSERT INTO custom_commands (user_id, command, response) VALUES (?, ?, ?);',
      [userId, command, response]
    );
  } catch (err) {
    // TODO: Catch the error only when it's a unique constraint violation
    return `Error: a custom command "${command}" has already been registered.`;
  }

  return `Custom command \`${CONF.general.command_symbol}${command}\` successfully registered!`;
};

export const removeCustomCommand = async (pool: mysql.Pool, command: string, user: Eris.User) => {
  // TODO: Allow admin users to delete custom commands of any user
  const { affectedRows } = await _delete(
    pool,
    'DELETE FROM custom_commands WHERE command = ? AND user_id = ?;',
    [command, user.id]
  );
  if (affectedRows === 0) {
    return `You have no registered custom command "${command}"`;
  }

  return `Custom command "${command}" successfully deleted.`;
};

export const getCustomCommandResponse = async (
  pool: mysql.Pool,
  command: string
): Promise<string | undefined> => {
  const row = (
    await query<{ response: string }>(
      pool,
      'SELECT `response` FROM custom_commands WHERE command = ?;',
      [command]
    )
  )[0];
  if (R.isNil(row)) {
    return;
  }

  return row.response;
};
