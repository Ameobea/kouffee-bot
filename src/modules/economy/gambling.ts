import mysql from 'mysql';
import * as R from 'ramda';
import { Option } from 'funfix-core';
import { CONF } from '../../conf';
import { query, update, getConn, commit } from '../../dbUtil';
import Eris, { EmbedOptions } from 'eris';

const acceptedTextBets = [
  'red',
  'black',
  'even',
  'odd',
  '00',
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
];
const redWin = [
  '1',
  '3',
  '5',
  '7',
  '9',
  '12',
  '14',
  '16',
  '18',
  '19',
  '21',
  '23',
  '25',
  '27',
  '30',
  '32',
  '34',
  '36',
];
const blackWin = [
  '2',
  '4',
  '6',
  '8',
  '10',
  '11',
  '13',
  '15',
  '17',
  '20',
  '22',
  '24',
  '26',
  '28',
  '29',
  '31',
  '33',
  '35',
];
const evenWin = [
  '2',
  '4',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
  '18',
  '20',
  '22',
  '24',
  '26',
  '28',
  '30',
  '32',
  '34',
  '36',
];
const oddWin = [
  '1',
  '3',
  '5',
  '7',
  '9',
  '11',
  '13',
  '15',
  '17',
  '19',
  '21',
  '23',
  '25',
  '27',
  '29',
  '31',
  '33',
  '35',
];

const getRandomInt = (max: number) => {
  return Math.floor(Math.random() * Math.floor(max));
};

export const roulette = async (
  msg: string,
  pool: mysql.Pool,
  user: Eris.User
): Promise<string | { embed: EmbedOptions }> => {
  let msgParts = msg.split(' ');

  if (
    msgParts.length < 3 ||
    !acceptedTextBets.includes(msgParts[1]) ||
    msgParts[2].includes('.') ||
    (!Number(msgParts[2]) && msgParts[2] != 'all') ||
    Number(msgParts[2]) <= 0
  ) {
    return `Usage: -roulette <red/black/even/odd/00/0-36> <bet amount>`;
  }

  const [row] = await query<{ user_id: number; balance: number }>(
    pool,
    'SELECT * FROM economy_balances WHERE user_id = ?;',
    [user.id]
  );
  let balance = Option.of(row)
    .map(R.prop('balance'))
    .getOrElse(0);
  let betAmount;
  let roll = getRandomInt(38);
  let multiplier = 0;
  if (msgParts[2] === 'all') {
    betAmount = balance;
  } else {
    betAmount = Number(msgParts[2]);
  }
  let betChoice = msgParts[1];
  if (
    R.isNil(row) ||
    Option.of(row)
      .map(R.prop('balance'))
      .getOrElse(0) < Number(betAmount)
  ) {
    return `You dont have enough ${CONF.economy.currency_name}!`;
  }

  if (
    (betChoice === 'red' && redWin.includes(String(roll))) ||
    (betChoice === 'black' && blackWin.includes(String(roll))) ||
    (betChoice === 'even' && evenWin.includes(String(roll))) ||
    (betChoice === 'odd' && oddWin.includes(String(roll)))
  ) {
    multiplier = 2;
  } else if ((betChoice === '00' && String(roll) === '37') || String(roll) === betChoice) {
    multiplier = 36;
  }
  let earnings = betAmount * multiplier;
  let endBalance = balance - betAmount + earnings;
  let netChange = 0 - betAmount + earnings;
  let winEmoji;
  let color;

  switch (multiplier) {
    case 0:
      winEmoji = `:chart_with_downwards_trend:`;
      break;
    case 2:
      winEmoji = `:chart_with_upwards_trend:`;
      break;
    case 36:
      winEmoji = `:rocket:`;
      break;
    default:
      winEmoji = ``;
      break;
  }

  if (redWin.includes(String(roll))) color = 0xff0000;
  else if (blackWin.includes(String(roll))) color = 0x000000;
  else color = 0x00ff00;

  let embedObject: { embed: EmbedOptions } = {
    embed: {
      title: winEmoji + `  You rolled ` + (roll === 37 ? '00' : roll) + `  ` + winEmoji,
      //description: balance + " --> " + endBalance,
      color,
      fields: [
        {
          name: `Old Balance`,
          value: balance + ` ${CONF.economy.currency_name}`,
        },
        {
          name: `New Balance`,
          value: endBalance + ` ${CONF.economy.currency_name}`,
        },
      ],
    },
  };

  const conn = await getConn(pool);
  return new Promise(resolve => {
    conn.beginTransaction(async err => {
      if (err) {
        throw err;
      }

      await updateAmount(conn, user.id, netChange);
      await commit(conn);

      pool.releaseConnection(conn);

      resolve(embedObject);
    });
  });
};

const updateAmount = async (conn: mysql.PoolConnection, userId: string, amount: Number) => {
  await update(conn, 'UPDATE economy_balances SET balance = balance + ? WHERE user_id = ?;', [
    amount,
    userId,
  ]);
};
