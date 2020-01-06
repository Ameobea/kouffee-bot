import Eris from 'eris';
import mysql from 'mysql';

import { loadConf, CONF } from './conf';
import { claimDaily, getBalance, getTopBalances } from './modules/economy';
import { getRandomAmeoLink } from './modules/random-ameolink';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('`DISCORD_TOKEN` environment variable must be supplied');
}

const client = Eris(token);

const cmd = (name: string): string => `${CONF.general.command_symbol}${name}`;

const getResponse = async (
  pool: mysql.Pool,
  msgContent: string,
  msg: Eris.Message
): Promise<string | undefined | null> => {
  const lowerMsg = msgContent.toLowerCase();

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
  }
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

  var pool = mysql.createPool({
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
