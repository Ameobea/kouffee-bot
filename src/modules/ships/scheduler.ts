/**
 * Handles setting timers for various events and handling timer state
 */

import * as R from 'ramda';
import Eris from 'eris';
import mysql from 'mysql';
import scheduler from 'node-schedule';
import dayjs from 'dayjs';
import numeral from 'numeral';

import { query, insert, dbNow } from 'src/dbUtil';
import { CONF } from 'src/conf';
import { TableNames } from './db';
import { Production } from './economy';
import { BuildableShip } from './fleet';
import { getRaidTimeDurString, formatInventory } from './formatters';
import { deserializeRaidResult } from './raids';
import { RaidResult } from './raids/types';
import { deJoqify } from 'src/util';
import { getRandomAnimeGirlURL } from '../anime-girl';

export enum NotificationType {
  ProductionUpgrade = 0,
  ShipBuild = 1,
  RaidReturn = 2,
  Arbitrary = -1,
  PeriodicReminder = -2,
}

export interface NotificationRow {
  userId: string;
  notificationType: NotificationType;
  guildId: string;
  channelId: string;
  notificationPayload: string;
  reminderTime: Date;
}

export interface PeriodicReminderRow {
  id: number;
  userId: string;
  guildId: string;
  channelId: string;
  notificationPayload: string;
  reminderTime: string;
}

const buildNotificationContent = async (
  conn: mysql.Pool | mysql.PoolConnection,
  notification: Omit<NotificationRow, 'reminderTime'>
): Promise<Eris.MessageContent | Eris.MessageContent[]> => {
  switch (+notification.notificationType) {
    case NotificationType.ProductionUpgrade: {
      const [productionType, level]: [keyof Production, string] =
        notification.notificationPayload.split('-') as [keyof Production, string];
      return `<@${notification.userId}>: Your ${CONF.ships.resource_names[productionType]} upgrade to level ${level} is complete!`;
    }
    case NotificationType.ShipBuild: {
      const [shipType, rawCount]: [BuildableShip, string] = notification.notificationPayload.split(
        '-'
      ) as [BuildableShip, string];
      const count = +rawCount;
      if (Number.isNaN(count)) {
        throw new Error(`Failed to parse count in ship build notification row: "${rawCount}"`);
      }

      return `<@${notification.userId}>: The construction of your ${numeral(count).format(
        '1,000'
      )} ${CONF.ships.ship_names[shipType]} is complete!`;
    }
    case NotificationType.RaidReturn: {
      const { userId, rewardItems, durationTier, location }: RaidResult = deserializeRaidResult(
        notification.notificationPayload
      );
      // TODO: Include the raid's loot in the message.  We also must compute that ahead of time...
      return [
        `<@${userId}>: Your ${getRaidTimeDurString(durationTier)} raid to ${
          CONF.ships.raid_location_names[location].name
        } has returned!`,
        `Loot:\n\n${formatInventory(rewardItems)}`,
      ];
    }
    case NotificationType.Arbitrary: {
      return `<@${notification.userId}>: ${deJoqify(notification.notificationPayload)}`;
    }
    case NotificationType.PeriodicReminder: {
      const animeGirlURL = await getRandomAnimeGirlURL(conn);
      return `<@${notification.userId}>: ${deJoqify(
        notification.notificationPayload
      )}\n${animeGirlURL}`;
    }
    default: {
      throw new Error(`Unhandled notification type: "${notification.notificationType}"`);
    }
  }
};

const sendNotification = async (
  conn: mysql.Pool | mysql.PoolConnection,
  client: Eris.Client,
  notification: Omit<NotificationRow, 'reminderTime'>
) => {
  const guild = client.guilds.get(notification.guildId);
  if (!guild) {
    console.error(
      `ERROR: Not connected to guild id "${notification.guildId}"; can't send notification.`
    );
    return;
  }

  const channel = guild.channels.get(notification.channelId);
  if (!channel) {
    console.error(
      `ERROR: No channel id "${notification.channelId}" in guild "${notification.guildId}"; can't send notification`
    );
    return;
  }

  const content = await buildNotificationContent(conn, notification);
  if (Array.isArray(content)) {
    content.forEach(content => client.createMessage(notification.channelId, content));
  } else {
    client.createMessage(notification.channelId, content);
  }
};

export const initTimers = async (client: Eris.Client, conn: mysql.Pool) => {
  const notificationsToSchedule = await query<NotificationRow>(
    conn,
    `SELECT * FROM \`${TableNames.Notifications}\` WHERE reminderTime >= NOW();`,
    []
  );
  const now = await dbNow(conn);
  const localNow = dayjs();
  const offsetSeconds = localNow.diff(now, 'second');
  notificationsToSchedule.forEach(notification =>
    scheduler.scheduleJob(
      dayjs(notification.reminderTime).add(offsetSeconds, 'second').toDate(),
      () => sendNotification(conn, client, notification)
    )
  );
  if (!R.isEmpty(notificationsToSchedule)) {
    console.log(`Finished scheduling ${notificationsToSchedule.length} notifications`);
  }

  const periodicRemindersToSchedule = await query<PeriodicReminderRow>(
    conn,
    'SELECT * FROM `periodic_reminders`',
    []
  );
  periodicRemindersToSchedule.forEach(reminder =>
    scheduler.scheduleJob(`periodic-reminder-${reminder.id}`, reminder.reminderTime, () =>
      sendNotification(conn, client, {
        ...reminder,
        notificationType: NotificationType.PeriodicReminder,
      })
    )
  );
  console.log(`Finished scheduling ${periodicRemindersToSchedule.length} periodic reminders`);
};

export const setReminder = async (
  client: Eris.Client,
  conn: mysql.Pool | mysql.PoolConnection,
  notification: NotificationRow,
  now: Date
): Promise<void> => {
  const localNow = dayjs();
  const offsetSeconds = localNow.diff(now, 'second');
  const when = dayjs(notification.reminderTime);
  if (Number.isNaN((when as any).$y)) {
    for (let i = 0; i < 3; i++) {
      await sendNotification(conn, client, {
        ...notification,
        notificationPayload: ':middle_finger:',
      });
    }
    return;
  }

  if (notification.reminderTime.getTime() < now.getTime()) {
    return;
  }

  await insert(
    conn,
    `INSERT INTO \`${TableNames.Notifications}\` (userId, notificationType, guildId, channelId, notificationPayload, reminderTime) VALUES (?, ?, ?, ?, ?, ?);`,
    [
      notification.userId,
      notification.notificationType,
      notification.guildId,
      notification.channelId,
      notification.notificationPayload,
      notification.reminderTime,
    ]
  );

  scheduler.scheduleJob(when.add(offsetSeconds, 'second').toDate(), () =>
    sendNotification(conn, client, notification)
  );
};

/**
 * @returns {Promise<void>} The ID of the newly created period reminder.
 */
export const schedulePeriodicReminder = async (
  client: Eris.Client,
  conn: mysql.Pool | mysql.PoolConnection,
  reminder: PeriodicReminderRow
): Promise<number> => {
  await insert(
    conn,
    'INSERT INTO `periodic_reminders` (userId, guildId, channelId, notificationPayload, reminderTime) VALUES (?, ?, ?, ?, ?);',
    [
      reminder.userId,
      reminder.guildId,
      reminder.channelId,
      reminder.notificationPayload,
      reminder.reminderTime,
    ]
  );
  const { id } = (await query<{ id: number }>(conn, 'SELECT LAST_INSERT_ID() AS id;', []))[0];

  const jobName = `period-reminder-${id}`;
  scheduler.scheduleJob(jobName, reminder.reminderTime, () =>
    sendNotification(conn, client, {
      ...reminder,
      notificationType: NotificationType.PeriodicReminder,
    })
  );
  return id;
};
