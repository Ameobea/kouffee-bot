/**
 * Handles setting timers for various events and handling timer state
 */

import * as R from 'ramda';
import Eris from 'eris';
import mysql from 'mysql';
import scheduler from 'node-schedule';
import dayjs from 'dayjs';
import numeral from 'numeral';

import { query, insert, dbNow } from '../../dbUtil';
import { CONF } from '../../conf';
import { TableNames } from './db';
import { Production } from './economy';
import { BuildableShip } from './fleet';

export enum NotificationType {
  ProductionUpgrade,
  ShipBuild,
}

export interface NotificationRow {
  userId: string;
  notificationType: NotificationType;
  guildId: string;
  channelId: string;
  notificationPayload: string;
  reminderTime: Date;
}

const buildNotificationContent = (notification: NotificationRow): Eris.MessageContent => {
  switch (notification.notificationType) {
    case NotificationType.ProductionUpgrade: {
      const [productionType, level]: [
        keyof Production,
        string
      ] = notification.notificationPayload.split('-') as [keyof Production, string];
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
    default: {
      throw new Error(`Unhandled notification type: "${notification.notificationType}"`);
    }
  }
};

const sendNotification = (client: Eris.Client, notification: NotificationRow) => {
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

  client.createMessage(notification.channelId, buildNotificationContent(notification));
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
      dayjs(notification.reminderTime)
        .add(offsetSeconds, 'second')
        .toDate(),
      () => sendNotification(client, notification)
    )
  );
  if (!R.isEmpty(notificationsToSchedule)) {
    console.log(`Finished scheduling ${notificationsToSchedule.length} notifications`);
  }
};

export const setReminder = async (
  client: Eris.Client,
  conn: mysql.Pool | mysql.PoolConnection,
  notification: NotificationRow,
  now: Date
): Promise<void> => {
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

  const localNow = dayjs();
  const offsetSeconds = localNow.diff(now, 'second');

  scheduler.scheduleJob(
    dayjs(notification.reminderTime)
      .add(offsetSeconds, 'second')
      .toDate(),
    () => sendNotification(client, notification)
  );
};
