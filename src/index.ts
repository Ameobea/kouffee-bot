import Eris, { EmbedOptions, Message, TextableChannel } from 'eris';
import mysql from 'mysql';
import * as R from 'ramda';

import { loadConf, CONF } from './conf.js';
import { createConnPool } from './dbUtil.js';
import { claimDaily, getBalance, getTopBalances } from './modules/economy/index.js';
import { getRandomAmeoLink } from './modules/random-ameolink.js';
import { roulette } from './modules/economy/gambling.js';
import { maybeHandleCommand, init as initShips } from './modules/ships/index.js';
import { initItemData } from './modules/ships/inventory/item.js';
import {
  getCustomCommandResponse,
  addCustomCommand,
  removeCustomCommand,
  getRandomCustomCommand,
} from './modules/custom-command.js';
import { getRandomLikedTweetURL } from './modules/random-ameo-liked-tweet.js';
import { getRandomAnimeGirlURL } from './modules/anime-girl.js';
import {
  createPeriodicReminder,
  createReminder,
  deletePeriodicReminder,
  listPeriodicReminders,
} from './modules/remind.js';
import {
  pickMovie,
  addMovie,
  deleteMovie,
  listMovies,
  setMovieWatched,
  hasMovie,
} from './modules/movie.js';
import { archivePost, getRandomArchivedPost } from './modules/archive.js';
import { getRandomOSRSLink, getRandomRS3Link } from './modules/random-osrs.js';
import { getSankakuComplexImageDriver } from './modules/sankaku-complex.js';
import { getServerDate } from './modules/serverDate.js';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('`DISCORD_TOKEN` environment variable must be supplied');
}

const client = Eris(token, {
  intents: [
    'guilds',
    'messageContent',
    'guildMessageReactions',
    'directMessageReactions',
    'guildMessages',
    'directMessages',
  ],
});

const OUR_USER_ID = '663604736485752832';

export const cmd = (name: string): string => `${CONF.general.command_symbol}${name}`;

export type CommandResponse =
  | string
  | undefined
  | null
  | string[]
  | { type: 'embed'; embed: EmbedOptions }
  | { type: 'file'; file: Buffer; name: string };

const getResponse = async (
  pool: mysql.Pool,
  msgContent: string,
  msg: Eris.Message
): Promise<CommandResponse> => {
  // Ignore our own messages
  if (msg.author.id === OUR_USER_ID) {
    return;
  }

  const channel = client.getChannel(msg.channel.id);
  const lowerMsg = msgContent.trim().toLowerCase();
  if (lowerMsg.includes('http://') || lowerMsg.includes('https://') || msg.attachments.length > 0) {
    archivePost(
      [msg.cleanContent || '', ...msg.attachments.map(R.prop('url'))].join('\n'),
      msg.author.id,
      msg.author.username,
      pool,
      channel.type === 0 ? channel.name : 'unknown',
      false
    );
  }

  if (!lowerMsg.startsWith(CONF.general.command_symbol)) {
    return;
  }

  const lowerMsgContent = lowerMsg
    .split(CONF.general.command_symbol)
    .slice(1)
    .join(CONF.general.command_symbol);
  const msgArgContent = msgContent
    .trim()
    .split(CONF.general.command_symbol)
    .slice(1)
    .join(CONF.general.command_symbol);

  const [first, ...rest] = lowerMsg.split(/\s+/g);
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
  } else if (lowerMsg.startsWith(cmd('roulette'))) {
    return roulette(lowerMsg, pool, msg.author);
  } else if (lowerMsg.startsWith(cmd('hazbin'))) {
    return getRandomAmeoLink(Number.parseInt('74w', 36), Number.parseInt('7hh', 36));
  } else if (lowerMsg.startsWith(cmd('addcommand'))) {
    const [first, command] = msgArgContent.split(' ');
    return addCustomCommand(
      pool,
      rest[0],
      msgArgContent.replace(first + ' ', '').replace(command + ' ', ''),
      msg.author.id
    );
  } else if (lowerMsg.startsWith(cmd('removecommand'))) {
    return removeCustomCommand(pool, rest[0], msg.author);
  } else if (lowerMsg.startsWith(cmd('tweet'))) {
    return getRandomLikedTweetURL(pool);
  } else if (lowerMsg.startsWith(cmd('remind'))) {
    return createReminder(client, pool, msg);
  } else if (lowerMsg.startsWith(cmd('listmovies')) || lowerMsg.startsWith(cmd('movies'))) {
    return listMovies(pool);
  } else if (lowerMsg.startsWith(cmd('movie'))) {
    return pickMovie(pool);
  } else if (lowerMsg.startsWith(cmd('addmovie'))) {
    const newMovie = rest.join(' ');
    if (await hasMovie(pool, newMovie)) {
      return `Movie (${newMovie}) already exists`;
    } else {
      await addMovie(pool, newMovie);
      return `Movie added (${newMovie})`;
    }
  } else if (lowerMsg.startsWith(cmd('deletemovie')) || lowerMsg.startsWith(cmd('removie'))) {
    await deleteMovie(pool, rest.join(' '));
    return 'Movie deleted';
  } else if (lowerMsg.startsWith(cmd('watchmovie'))) {
    const success = await setMovieWatched(pool, rest.join(' '), true);
    return success ? 'Successfully marked move as watched' : 'Movie not found!';
  } else if (lowerMsg.startsWith(cmd('unwatchmovie'))) {
    const success = await setMovieWatched(pool, rest.join(' '), false);
    return success ? 'Successfully marked move as watched' : 'Movie not found!';
  } else if (lowerMsg.startsWith(cmd('ask'))) {
    return {
      type: 'embed',
      embed: { image: { url: 'https://cdn.discordapp.com/emojis/631597540940185600.png?v=1' } },
    };
  } else if (lowerMsg.startsWith(cmd('flip'))) {
    const flip = Math.random();
    if (flip < 0.5) {
      return 'Heads';
    } else if (flip > 0.5) {
      return 'Tails';
    } else {
      return 'The coin landed on its side';
    }
  } else if (lowerMsg.startsWith(cmd('agirl'))) {
    return await getRandomAnimeGirlURL(pool);
  } else if (lowerMsg.startsWith(cmd('randomrs3'))) {
    return getRandomRS3Link();
  } else if (lowerMsg.startsWith(cmd('randomrs'))) {
    return getRandomOSRSLink();
  } else if (lowerMsg.startsWith(cmd('random'))) {
    return await getRandomCustomCommand(pool);
  } else if (lowerMsg.startsWith(cmd('goodpost'))) {
    return await getRandomArchivedPost(pool, true);
  } else if (
    lowerMsg.startsWith(cmd('badpost')) ||
    lowerMsg.startsWith(cmd('post')) ||
    lowerMsg.startsWith(cmd('shitpost'))
  ) {
    // Disable in meme team
    if (channel.type === 0 && channel.guild.id === '161336072884715521') {
      return 'The admins have voted to disable this command in this server.  You can use #kouffee-shop in Kitty Facts';
    }
    return await getRandomArchivedPost(pool, false);
  } else if (lowerMsg.startsWith(cmd('sc')) || lowerMsg.startsWith(cmd('sankaku'))) {
    return await getSankakuComplexImageDriver(msg);
  } else if (lowerMsg.startsWith(cmd('b') + ' ')) {
    return await getSankakuComplexImageDriver(msg, true);
  } else if (lowerMsg.startsWith(cmd('alarm'))) {
    return await createPeriodicReminder(client, pool, msg);
  } else if (lowerMsg.startsWith(cmd('listalarms'))) {
    return await listPeriodicReminders(pool, msg);
  } else if (lowerMsg.startsWith(cmd('deletealarm'))) {
    return await deletePeriodicReminder(pool, msg);
  } else if (lowerMsg.startsWith(cmd('date'))) {
    return await getServerDate(pool);
  }

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

  // Save kitty facts general discussion from the scourge for Jacques' sake
  if (
    lowerMsg.startsWith(cmd('raids')) &&
    (channel.id === '285165168973840387' || channel.id === '674182365383229441')
  ) {
    return "I love doing raids in OSRS with my friends :)  Let's do some chambers or ToB together soon!";
  }

  // Check to see if it was a custom command and return the custom response if it is
  return getCustomCommandResponse(pool, msgArgContent, msg.author.id);
};

const sendMultipleMessages = (msg: Eris.Message<TextableChannel>, messages: string[]) => {
  let i = 0;
  const timedLoop = () => {
    setTimeout(async () => {
      try {
        client.createMessage(msg.channel.id, messages[i]);
      } catch (err) {
        console.error('Error creating message: ', err);
      }
      i++;
      if (i < messages.length) {
        timedLoop();
      }
    }, 800);
  };
  timedLoop();
};

const initMsgHandler = (pool: mysql.Pool) => {
  client.on('messageCreate', async untypedMsg => {
    if ((!untypedMsg.channel as any as TextableChannel).createMessage) {
      return;
    }
    const msg = untypedMsg as any as Message<TextableChannel>;
    const res = await getResponse(pool, msg.cleanContent || '', msg);
    if (!res) {
      return;
    }

    try {
      if (Array.isArray(res)) {
        sendMultipleMessages(msg, res);
        return;
      }

      if (typeof res === 'string' || res.type === 'embed') {
        await client.createMessage(msg.channel.id, res);
      } else {
        await client.createMessage(msg.channel.id, {}, res);
      }
    } catch (err) {
      console.error('Error creating message: ', err);
    }
  });
};

const ARCHIVE_REACTION_NAME = 'kouffee';
const ARCHIVE_REACTION_ID = '788608570874265610';
const initReactionHandler = async (pool: mysql.Pool) => {
  client.on(
    'messageReactionAdd',
    async ({ id: msgID, channel: { id: channelID } }, emoji, reactor) => {
      const userID = reactor.id;
      if (userID === OUR_USER_ID) {
        return;
      }

      if (emoji.id === ARCHIVE_REACTION_ID) {
        const msg = await client.getMessage(channelID, msgID);
        if (!msg?.cleanContent) {
          return;
        }

        const channel = client.getChannel(channelID);
        await archivePost(
          msg.cleanContent!,
          userID,
          msg.author.username,
          pool,
          channel.type === 0 ? channel.name : 'unknown',
          true
        );
        await msg.addReaction(`${ARCHIVE_REACTION_NAME}:${ARCHIVE_REACTION_ID}`);
      }
    }
  );
};

client.on('connect', () => console.log('Bot connected!'));

client.on('error', err => console.error(err));

const init = async () => {
  await loadConf();
  console.log('Loaded config');

  const pool = createConnPool(CONF);

  console.log('Initializing ships module...');
  await initShips(client, pool);
  console.log('Initialized ships module.');

  await initItemData().catch(err => {
    console.error('Error initializing item data: ', err);
    throw err;
  });
  console.log('Loading item data item database file');

  initMsgHandler(pool);
  initReactionHandler(pool);

  client.connect();
};

init();
