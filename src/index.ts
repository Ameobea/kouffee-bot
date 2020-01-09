import Eris from 'eris';
import mysql from 'mysql';

import { loadConf, CONF } from './conf';
import { claimDaily, getBalance, getTopBalances } from './modules/economy';
import { getRandomAmeoLink } from './modules/random-ameolink';
import { pingExpochant } from './modules/expochant';
import { roulette } from './modules/economy/gambling';

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
): Promise<string | undefined | null | Object> => {
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
  } else if (lowerMsg.startsWith(cmd('expochant'))){
    sendMultipleMessages(msg, await pingExpochant(lowerMsg));
    return null;
  } else if (lowerMsg.startsWith(cmd('roulette'))){
    return roulette(lowerMsg, pool, msg.author);
  }
};

const sendMultipleMessages = (msg: Eris.Message, messages: string[]) => {
  let i = 0;
  function timedLoop(){
    setTimeout(function(){
      client.createMessage(msg.channel.id, messages[i]);
      i++;
      if(i < messages.length){
        timedLoop();
      }
    },2500);
  }
  timedLoop();
}

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
