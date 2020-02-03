import Eris, { EmbedOptions } from 'eris';
import mysql from 'mysql';

import { loadConf, CONF } from './conf';
import { claimDaily, getBalance, getTopBalances } from './modules/economy';
import { getRandomAmeoLink } from './modules/random-ameolink';
import { roulette } from './modules/economy/gambling';
import { maybeHandleCommand, init as initShips } from './modules/ships';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('`DISCORD_TOKEN` environment variable must be supplied');
}

const client = Eris(token);

export const cmd = (name: string): string => `${CONF.general.command_symbol}${name}`;

const getResponse = async (
  pool: mysql.Pool,
  msgContent: string,
  msg: Eris.Message
): Promise<string | undefined | null | string[] | { embed: EmbedOptions }> => {
  const lowerMsg = msgContent.trim().toLowerCase();

  if (lowerMsg.startsWith(cmd('kouffee'))) {
    return 'https://ameo.link/u/6zv.jpg';
  } else if (lowerMsg.startsWith(cmd('claim'))) {
    return claimDaily(pool, msg.author);
  } else if (lowerMsg.startsWith(cmd('$')) || lowerMsg.startsWith(cmd('balance'))) {
    return getBalance(pool, msg.author.id);
  } else if (lowerMsg.startsWith(cmd('top'))) {
    return getTopBalances(pool);
  } else if (lowerMsg.startsWith(cmd('ameolink'))) {
    return getRandomAmeoLink();
  } else if (lowerMsg.startsWith(cmd('roulette'))) {
    return roulette(lowerMsg, pool, msg.author);
  } else if (lowerMsg.startsWith(cmd('hazbin'))) {
    return getRandomAmeoLink(Number.parseInt('74w', 36), Number.parseInt('7hh', 36));
  }

  const [first, ...rest] = lowerMsg.split(/\s+/g);

  if (first && (first.startsWith(cmd('ship')) || first === cmd('s'))) {
    const shipsRes = await maybeHandleCommand({
      pool,
      userId: msg.author.id,
      msg,
      splitContent: rest,
      client,
    });
    if (shipsRes) {
      return shipsRes;
    } else {
      return 'Invalid `ships` subcommand.  TODO: Add help docs...';
    }
  }
};

const sendMultipleMessages = (msg: Eris.Message, messages: string[]) => {
  let i = 0;
  function timedLoop() {
    setTimeout(function() {
      client.createMessage(msg.channel.id, messages[i]);
      i++;
      if (i < messages.length) {
        timedLoop();
      }
    }, 800);
  }
  timedLoop();
};

const initMsgHandler = (pool: mysql.Pool) => {
  client.on('messageCreate', async msg => {
    if (!msg.cleanContent) {
      return;
    }

    const res = await getResponse(pool, msg.cleanContent, msg);
    if (!res) {
      return;
    }

    if (Array.isArray(res)) {
      sendMultipleMessages(msg, res);
    } else {
      client.createMessage(msg.channel.id, res);
    }
  });
};

client.on('connect', () => console.log('Bot connected!'));

client.on('error', err => console.error(err));

const init = async () => {
  await loadConf();
  console.log('Loaded config');

  const pool = mysql.createPool({
    connectionLimit: 10,
    host: CONF.database.host,
    user: CONF.database.username,
    password: CONF.database.password,
    database: CONF.database.database,
  });

  console.log('Initializing ships module...');
  await initShips(client, pool);
  console.log('Initialized ships module.');

  initMsgHandler(pool);

  client.connect();
};

init();
