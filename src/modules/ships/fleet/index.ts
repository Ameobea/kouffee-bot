import * as R from 'ramda';
import mysql from 'mysql';
import numeral from 'numeral';
import dayjs from 'dayjs';
import Eris from 'eris';

import { ShipProductionCostGetters } from 'src/modules/ships/economy/curves/productionUpgrades';
import {
  getUserProductionAndBalancesState,
  setProductionAndBalances,
  queueFleetJob,
  getAllPendingOrRunningFleetJobs,
  transact,
  TableNames,
  setFleet,
} from 'src/modules/ships/db';
import { dbNow, query } from 'src/dbUtil';
import {
  computeLiveUserProductionAndBalances,
  multiplyBalances,
  getHasSufficientBalance,
  subtractBalances,
} from 'src/modules/ships/economy';
import { formatInsufficientResourceTypes } from 'src/modules/ships/formatters';
import { CONF } from 'src/conf';
import { setReminder, NotificationType } from 'src/modules/ships/scheduler';

export type BuildableShip = 'ship1' | 'ship2' | 'ship3' | 'shipSpecial1';
export const AllBuildableShipTypes: BuildableShip[] = ['ship1', 'ship2', 'ship3', 'shipSpecial1'];

export interface Fleet {
  ship1: number;
  ship2: number;
  ship3: number;
  ship4: number;
  shipSpecial1: number;
}

export enum FleetJobType {
  BuildShip,
}

interface FleetJobBase {
  startTime: Date;
  endTime: Date;
}

export type FleetJob = {
  jobType: FleetJobType.BuildShip;
  shipType: BuildableShip;
  shipCount: number;
} & FleetJobBase;

export interface FleetJobRow {
  userId: string;
  jobType: FleetJobType;
  startTime: Date;
  endTime: Date;
  shipType: BuildableShip;
  shipCount: number;
}

export const buildDefaultFleet = (): Fleet => ({
  ship1: 0,
  ship2: 0,
  ship3: 0,
  ship4: 0,
  shipSpecial1: 0,
});

/**
 * Given the last checkpointed fleet state and the list of fleet jobs that were finished (or will finish) after the last
 * checkpoint time, computes the current state of the fleet.
 */
export const computeLiveFleet = (
  now: Date,
  fleet: Fleet & { checkpointTime: Date; userId: string },
  applicableFleetJobs: FleetJob[]
): Fleet => {
  const liveFleet = { ...fleet };

  const nowTime = now.getTime();

  // First we handle any fleet jobs that are fully finished
  const fullyFinishedFleetJobs = applicableFleetJobs.filter(
    job => job.endTime.getTime() <= nowTime
  );
  fullyFinishedFleetJobs.forEach(job => {
    liveFleet[job.shipType] += job.shipCount;
  });

  // Then, we handle any fleet jobs that are partially finished.
  const partiallyFinishedFleetJobs = applicableFleetJobs.filter(
    job => job.startTime.getTime() < nowTime && job.endTime.getTime() > nowTime
  );
  partiallyFinishedFleetJobs.forEach(job => {
    const timePerShipMs = ShipProductionCostGetters[job.shipType].timeMs;
    const taskTimeProgressedMs = nowTime - job.startTime.getTime();
    const shipsFinished = Math.trunc(taskTimeProgressedMs / timePerShipMs);
    liveFleet[job.shipType] += shipsFinished;
  });

  return liveFleet;
};

export const queueFleetProduction = async (
  client: Eris.Client,
  msg: Eris.Message,
  conn: mysql.PoolConnection,
  userId: string,
  shipType: BuildableShip,
  count: number
) => {
  const now = await dbNow(conn);
  const {
    checkpointTime,
    balances,
    production,
    productionJobsEndingAfterCheckpointTime,
  } = await getUserProductionAndBalancesState(conn, userId);
  const {
    balances: liveBalances,
    production: liveProduction,
  } = computeLiveUserProductionAndBalances(
    now,
    checkpointTime,
    balances,
    production,
    productionJobsEndingAfterCheckpointTime
  );

  const { cost: costPerShip, timeMs: timeMsPerShip } = ShipProductionCostGetters[shipType];
  const upgradeCost = multiplyBalances(costPerShip, count);

  const insufficientResourceNames = getHasSufficientBalance(upgradeCost, liveBalances);
  if (insufficientResourceNames) {
    return formatInsufficientResourceTypes(insufficientResourceNames);
  }

  const newBalances = subtractBalances(liveBalances, upgradeCost);
  const completionTime = await transact(conn, userId, async conn => {
    await setProductionAndBalances(conn, userId, liveProduction, newBalances);

    const startTime = (await getAllPendingOrRunningFleetJobs(conn, userId, now)).reduce(
      (acc, job) => (job.endTime.getTime() > acc.getTime() ? job.endTime : acc),
      now
    );
    const completionTime = dayjs(startTime)
      .add(timeMsPerShip * count, 'millisecond')
      .toDate();
    await queueFleetJob({
      conn,
      shipType,
      userId,
      shipCount: count,
      startTime,
      endTime: completionTime,
    });

    return completionTime;
  });

  if (msg.channel.type === 0) {
    setReminder(
      client,
      conn,
      {
        userId,
        notificationType: NotificationType.ShipBuild,
        guildId: msg.channel.guild.id,
        channelId: msg.channel.id,
        reminderTime: completionTime,
        notificationPayload: `${shipType}-${count}`,
      },
      now
    );
  } else {
    console.warn(
      `Unhandled channel type of \`${msg.channel.type}\` in fleet queue command; not sending reminder.`
    );
  }

  return `Successfully queued ${numeral(count).format('1,000')} ${
    CONF.ships.ship_names[shipType]
  } for production!  Time to completion: ${dayjs(now).to(completionTime)}`;
};

/**
 * Returns the current fleet for a given user.  If the user doesn't have any DB state for their fleet, it will be initialized
 * with an empty fleet.
 */
export const getUserFleetState = (
  conn: mysql.PoolConnection,
  userId: string
): Promise<{
  fleet: Fleet & { checkpointTime: Date; userId: string };
  fleetJobsEndingAfterCheckpointTime: FleetJob[];
}> =>
  transact(conn, userId, async conn => {
    let [fleetRes] = await query<Fleet & { userId: string; checkpointTime: Date }>(
      conn,
      `SELECT * FROM \`${TableNames.Fleet}\` WHERE userId = ?;`,
      [userId]
    );
    if (R.isNil(fleetRes)) {
      fleetRes = { ...buildDefaultFleet(), userId, checkpointTime: await dbNow(conn) };
      await setFleet(conn, userId, fleetRes);
    }

    const fleetJobs = await query<FleetJob>(
      conn,
      `SELECT * FROM \`${TableNames.FleetJobs}\` WHERE userId = ? AND endTime >= ?;`,
      [userId, fleetRes.checkpointTime]
    );

    return { fleet: fleetRes, fleetJobsEndingAfterCheckpointTime: fleetJobs };
  });
