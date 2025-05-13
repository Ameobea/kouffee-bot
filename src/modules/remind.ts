import * as R from 'ramda';
import chrono from 'chrono-node';
import dayjs from 'dayjs';
import mysql from 'mysql';
import Eris from 'eris';
import scheduler from 'node-schedule';

import {
  setReminder,
  NotificationRow,
  NotificationType,
  PeriodicReminderRow,
  schedulePeriodicReminder,
} from './ships/scheduler.js';
import { dbNow, query, _delete } from '@src/dbUtil.js';

export const createReminder = async (
  client: Eris.Client,
  conn: mysql.Pool | mysql.PoolConnection,
  msg: Eris.Message
) => {
  console.log(msg.content);
  const [, ...rest] = msg.content.split(/\s+/g).filter(R.identity);
  if (R.isEmpty(rest)) {
    return 'Format: `!remind <when> <message>`';
  }

  const msgContent = rest.join(' ');
  console.log({ msgContent });

  let when: Date;
  let text: string;
  const now = await dbNow(conn);
  const channel = client.getChannel(msg.channel.id);
  try {
    const [{ start, text: text2 }] = chrono.parse(msgContent, now);
    when = start.date();
    text = text2;
    if (R.isNil(text) || R.isNil(text)) {
      throw 0;
    }

    if (channel.type !== 0) {
      console.warn(`Unhandled channel type for reminder: ${msg.channel.type}`);
      return 'Unable to respond on this channel because it is of an unhandlable type';
    }
  } catch (err) {
    console.error('Error parsing reminder time', err);
    return 'Unable to parse reminder time; try something like "in 3 days" or "at 3:30 PM"';
  }

  const reminderText = msgContent.replace(text, '');
  const notification: NotificationRow = {
    userId: msg.author.id,
    notificationType: NotificationType.Arbitrary,
    guildId: channel.guild.id,
    channelId: channel.id,
    notificationPayload: reminderText,
    reminderTime: when,
  };
  await setReminder(client, conn, notification, now);
  return `Successfully set reminder ${dayjs(now).to(dayjs(when))}`;
};

export const createPeriodicReminder = async (
  client: Eris.Client,
  conn: mysql.Pool | mysql.PoolConnection,
  msg: Eris.Message
) => {
  const channel = client.getChannel(msg.channel.id);
  if (channel.type !== 0) {
    console.warn(`Unhandled channel type for reminder: ${channel.type}`);
    return 'Unable to respond on this channel because it is of an unhandlable type';
  }

  const [, ...rest] = msg.content.split(/\s+/g).filter(R.identity);

  const [message, ...cronStringParts] = rest.join(' ').split('|');
  if (R.isEmpty(rest) || R.isEmpty(cronStringParts) || R.isEmpty(message)) {
    return 'Format: `!alarm <your message> | <cron string>`.  For help generating a cron string, see https://crontab.com/';
  }

  const cronString = cronStringParts.join(' ').trim();
  console.log('Scheduling alarm with cron string: ', cronString);
  const id = await schedulePeriodicReminder(client, conn, {
    id: 0,
    userId: msg.author.id,
    guildId: channel.guild.id,
    channelId: channel.id,
    notificationPayload: message,
    reminderTime: cronString,
  });

  return `Successfully created periodic reminder with id: ${id}`;
};

export const listPeriodicReminders = async (
  conn: mysql.Pool | mysql.PoolConnection,
  msg: Eris.Message
) => {
  const PeriodicRemindersForUser = await query<PeriodicReminderRow>(
    conn,
    'SELECT * FROM periodic_reminders WHERE userId = ?',
    [msg.author.id]
  );

  if (R.isEmpty(PeriodicRemindersForUser)) {
    return 'You have no periodic reminders set up';
  }

  const formatted = PeriodicRemindersForUser.map(
    reminder => `${reminder.id}: ${reminder.notificationPayload}`
  );
  return formatted.join('\n');
};

export const deletePeriodicReminder = async (
  conn: mysql.Pool | mysql.PoolConnection,
  msg: Eris.Message
) => {
  const [, id] = msg.content.split(' ');
  if (R.isEmpty(id)) {
    return 'Format: `!deletealarm <id>`';
  }

  const [reminder] = await query<PeriodicReminderRow>(
    conn,
    'SELECT * FROM periodic_reminders WHERE id = ?',
    [id]
  );
  if (!reminder) {
    return 'No reminder found with that id';
  } else if (reminder.userId !== msg.author.id) {
    return 'You do not own that alarm';
  }

  const jobName = `period-reminder-${reminder.id}`;
  scheduler.cancelJob(jobName);

  const { affectedRows } = await _delete(conn, 'DELETE FROM periodic_reminders WHERE id = ?', [id]);
  if (affectedRows === 0) {
    return 'No such reminder found';
  }

  return `Successfully deleted reminder with id: ${id}`;
};
