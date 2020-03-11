import * as R from 'ramda';
import chrono from 'chrono-node';
import dayjs from 'dayjs';
import mysql from 'mysql';
import Eris from 'eris';
import { setReminder, NotificationRow, NotificationType } from './ships/scheduler';
import { dbNow } from 'src/dbUtil';

export const createReminder = async (
  client: Eris.Client,
  conn: mysql.Pool | mysql.PoolConnection,
  msg: Eris.Message
) => {
  const [, ...rest] = msg.content.split(' ');
  if (R.isEmpty(rest)) {
    return 'Format: `!remind <when> <message>`';
  }

  const msgContent = rest.join(' ');

  let when: Date;
  let text: string;
  const now = await dbNow(conn);
  try {
    let c = chrono;
    const [{ start, text: text2 }] = chrono.parse(msgContent, now);
    when = start.date();
    console.log(c);
    text = text2;
    if (R.isNil(text) || R.isNil(text)) {
      throw 0;
    }

    if (msg.channel.type !== 0) {
      return 'Unable to respond on this channel because it is of an unhandlable type';
    }
  } catch (_err) {
    return 'Unable to parse reminder time; try something like "in 3 days" or "at 3:30 PM"';
  }

  const reminderText = msgContent.replace(text, '');
  const notification: NotificationRow = {
    userId: msg.author.id,
    notificationType: NotificationType.Arbirary,
    guildId: msg.channel.guild.id,
    channelId: msg.channel.id,
    notificationPayload: reminderText,
    reminderTime: when,
  };
  await setReminder(client, conn, notification, now);
  return `Successfully set reminder ${dayjs(now).to(dayjs(when))}`;
};
