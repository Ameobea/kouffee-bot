import Eris from 'eris';
import mysql from 'mysql';

import { loadConf, CONF } from './conf';
import { claimDaily, getBalance, getTopBalances } from './modules/economy';
import { getRandomAmeoLink } from './modules/random-ameolink';
import { getCustomCommandResponse } from './modules/custom-command';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('`DISCORD_TOKEN` environment variable must be supplied');
}

const client = Eris(token);

const getResponse = async (
  pool: mysql.Pool,
  msgContent: string,
  msg: Eris.Message
): Promise<string | undefined | null> => {
  const lowerMsg = msgContent.toLowerCase();

  if (!lowerMsg.startsWith(CONF.general.command_symbol)) {
    return;
  }

  const lowerMsgContent = lowerMsg.split(CONF.general.command_symbol)[1]!;

  if (lowerMsgContent.startsWith('kouffee')) {
    return 'https://ameo.link/u/6zv.jpg';
  } else if (lowerMsgContent.startsWith('claim')) {
    return claimDaily(pool, msg.author);
  } else if (lowerMsgContent === '$' || lowerMsgContent.startsWith('balance')) {
    return getBalance(pool, msg.author.id);
  } else if (lowerMsgContent.startsWith('top')) {
    return getTopBalances(pool);
  } else if (lowerMsgContent.startsWith('ameolink')) {
    return getRandomAmeoLink();
  }

  // Check to see if it was a custom command and return the custom response if it is
  return getCustomCommandResponse(pool, lowerMsgContent);
};

const initMsgHandler = (pool: mysql.Pool) => {
  client.on('messageCreate', async msg => {
    if (!msg.cleanContent) {
      return;
    }

    const res = await getResponse(pool, msg.cleanContent, msg);
    if (res) {
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

  initMsgHandler(pool);

  client.connect();
};

init();
