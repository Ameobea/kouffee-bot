import * as R from 'ramda';
import Eris from 'eris';
import mysql from 'mysql';
import numeral from 'numeral';
import dayjs, { Dayjs } from 'dayjs';
import { Option } from 'funfix-core';

import { getUserFleetState, getUserProductionAndBalancesState, queueProductionJob } from './db';
import { Fleet, computeLiveFleet, queueFleetProduction, BuildableShip } from './fleet';
import { dbNow, getConn } from '../../dbUtil';
import { CONF } from '../../conf';
import { cmd } from '../..';
import {
  computeLiveUserProductionAndBalances,
  Balances,
  Production,
  ProductionJob,
} from './economy';
import { ProductionIncomeGetters } from './economy/curves/production';
import { setReminder, NotificationType } from './scheduler';
import { ProductionUpgradeCostGetters } from './economy/curves/productionUpgrades';

const fmtCount = (count: number): string =>
  numeral(count).format(count > 10000 ? '1,000.0a' : '1,000');

const formatFleet = (fleet: Fleet): string => `
\`\`\`
${CONF.ships.ship_names['ship1']}: ${fmtCount(fleet.ship1)}
${CONF.ships.ship_names['ship2']}: ${fmtCount(fleet.ship2)}
${CONF.ships.ship_names['ship3']}: ${fmtCount(fleet.ship3)}
${CONF.ships.ship_names['ship4']}: ${fmtCount(fleet.ship4)}

${CONF.ships.ship_names['shipSpecial1']}: ${fmtCount(fleet.shipSpecial1)}
\`\`\`
`;

const formatBalances = (balances: Balances): string => `
\`\`\`
${CONF.ships.resource_names['tier1']}: ${fmtCount(balances.tier1)}
${CONF.ships.resource_names['tier2']}: ${fmtCount(balances.tier2)}
${CONF.ships.resource_names['tier3']}: ${fmtCount(balances.tier3)}

${CONF.ships.resource_names['special1']}: ${fmtCount(balances.special1)}
\`\`\`
`;

const formatProductionJob = (job: ProductionJob, curTier: number, now: Dayjs): string =>
  `\nUpgrade ${CONF.ships.resource_names[job.productionType]} Mine level ${curTier} -> ${curTier +
    1}; Completes ${now.to(job.endTime)}`;

const formatProductionUpgrades = (
  liveProduction: Production,
  now: Date,
  productionJobs: ProductionJob[]
): string | null => {
  const nowDayjs = dayjs(now);
  const nowTime = now.getTime();

  const applicableProductionJobs = productionJobs.filter(job => job.endTime.getTime() > nowTime);
  const [runningJob, ...pendingJobs] = applicableProductionJobs;
  if (R.isNil(runningJob)) {
    return null;
  }

  let msg = `

Running production job:${formatProductionJob(
    runningJob,
    liveProduction[runningJob.productionType],
    nowDayjs
  )}`;

  if (R.isEmpty(pendingJobs)) {
    return msg;
  }

  msg += '\n\nPending production jobs:';
  return pendingJobs.reduce(
    ({ production, msg }, job) => {
      return {
        msg: msg + formatProductionJob(job, production[job.productionType], nowDayjs),
        production: { ...production, [job.productionType]: production[job.productionType] + 1 },
      };
    },
    {
      production: {
        ...liveProduction,
        [runningJob.productionType]: liveProduction[runningJob.productionType] + 1,
      },
      msg,
    }
  ).msg;
};

const formatProduction = (
  production: Production,
  now: Date,
  productionJobsEndingAfterCheckpointTime: ProductionJob[]
): string => `
\`\`\`
${CONF.ships.resource_names['tier1']} Mine: Level ${fmtCount(production.tier1)} (${numeral(
  ProductionIncomeGetters.tier1(production.tier1, 1000)
).format('1,000.0')}/sec)
${CONF.ships.resource_names['tier2']} Mine: Level ${fmtCount(production.tier2)} (${numeral(
  ProductionIncomeGetters.tier2(production.tier2, 1000)
).format('1,000.0')}/sec)
${CONF.ships.resource_names['tier3']} Mine: Level ${fmtCount(production.tier3)} (${numeral(
  ProductionIncomeGetters.tier3(production.tier3, 1000)
).format('1,000.0')}/sec)${formatProductionUpgrades(
  production,
  now,
  productionJobsEndingAfterCheckpointTime
) || ''}
\`\`\`
`;

interface CommandHandlerArgs {
  client: Eris.Client;
  pool: mysql.Pool;
  msg: Eris.Message;
  userId: string;
  args: string[];
}

const printCurFleet = async ({ pool, userId }: CommandHandlerArgs) => {
  const conn = await getConn(pool);
  try {
    const {
      fleet,
      fleetJobsEndingAfterCheckpointTime: fleetJobsEndingAfterLastCommit,
    } = await getUserFleetState(conn, userId);
    const liveFleet = computeLiveFleet(await dbNow(conn), fleet, fleetJobsEndingAfterLastCommit);
    return formatFleet(liveFleet);
  } catch (err) {
    throw err;
  } finally {
    conn.release();
  }
};

const printCurBalances = async ({ pool, userId }: CommandHandlerArgs): Promise<string> => {
  const [conn1, conn2] = await Promise.all([getConn(pool), getConn(pool)] as const);

  try {
    const [
      now,
      { checkpointTime, balances, production, productionJobsEndingAfterCheckpointTime },
    ] = await Promise.all([
      dbNow(conn1),
      getUserProductionAndBalancesState(conn2, userId),
    ] as const);
    const { balances: liveBalances } = computeLiveUserProductionAndBalances(
      now,
      checkpointTime,
      balances,
      production,
      productionJobsEndingAfterCheckpointTime
    );

    return formatBalances(liveBalances);
  } finally {
    conn1.release();
    conn2.release();
  }
};

const printCurProduction = async ({ pool, userId }: CommandHandlerArgs): Promise<string> => {
  const [conn1, conn2] = await Promise.all([getConn(pool), getConn(pool)] as const);

  try {
    const [
      now,
      { checkpointTime, balances, production, productionJobsEndingAfterCheckpointTime },
    ] = await Promise.all([
      dbNow(conn1),
      getUserProductionAndBalancesState(conn2, userId),
    ] as const);
    const { production: liveProduction } = computeLiveUserProductionAndBalances(
      now,
      checkpointTime,
      balances,
      production,
      productionJobsEndingAfterCheckpointTime
    );

    return formatProduction(liveProduction, now, productionJobsEndingAfterCheckpointTime);
  } finally {
    conn1.release();
    conn2.release();
  }
};

const productionNameToKey = (name: string): keyof Production | null => {
  const processedName = name.trim().toLowerCase();
  return Option.of(
    Object.entries(CONF.ships.resource_names).find(
      ([, name]) => processedName === name.toLowerCase()
    )
  )
    .map(R.head)
    .orNull();
};

const buildableShipNameToKey = (name: string): BuildableShip | null => {
  const processedName = name.trim().toLowerCase();
  return Option.of(
    Object.entries(CONF.ships.ship_names).find(([, name]) => processedName === name.toLowerCase())
  )
    .map(R.head)
    .orNull();
};

const formatCost = (cost: Balances): string => {
  const sortedKeys: (keyof Balances)[] = [
    'tier1' as const,
    'tier2' as const,
    'tier3' as const,
    'special1' as const,
  ];
  if (sortedKeys.length !== Object.keys(cost).length) {
    throw new Error('Wrong key count in `formatCost`');
  }

  return sortedKeys
    .map(key => ({ key, val: cost[key] }))
    .filter(({ val }) => val > 0)
    .map(({ key, val }) => `${fmtCount(val)} ${CONF.ships.resource_names[key]}`)
    .join(', ');
};

const formatCurUpgradeCosts = (liveProduction: Production): string => `
\`\`\`
${CONF.ships.resource_names['tier1']} Level ${liveProduction.tier1} -> ${liveProduction.tier1 +
  1}: ${formatCost(ProductionUpgradeCostGetters.tier1(liveProduction.tier1).cost)}
${CONF.ships.resource_names['tier2']} Level ${liveProduction.tier2} -> ${liveProduction.tier2 +
  1}: ${formatCost(ProductionUpgradeCostGetters.tier2(liveProduction.tier2).cost)}
${CONF.ships.resource_names['tier3']} Level ${liveProduction.tier3} -> ${liveProduction.tier3 +
  1}: ${formatCost(ProductionUpgradeCostGetters.tier3(liveProduction.tier3).cost)}
\`\`\`
`;

const addByKey = <T>(a: T, b: T): T =>
  Object.fromEntries(
    Object.entries(a).map(([key, val]) => [key, val + Option.of(b[key as keyof T]).getOrElse(0)])
  );

const printCurUpgradeCosts = async (pool: mysql.Pool, userId: string): Promise<string> => {
  const conn = await getConn(pool);

  try {
    const {
      checkpointTime,
      balances: snapshottedBalances,
      production: snapshottedProduction,
      productionJobsEndingAfterCheckpointTime,
    } = await getUserProductionAndBalancesState(conn, userId);

    const now = await dbNow(pool);
    const nowTime = now.getTime();

    const { production: liveProduction } = computeLiveUserProductionAndBalances(
      now,
      checkpointTime,
      snapshottedBalances,
      snapshottedProduction,
      productionJobsEndingAfterCheckpointTime
    );

    const queuedUpgradeCountByTier = productionJobsEndingAfterCheckpointTime
      // Only care about jobs that haven't been accounted for when computing live production and balances
      .filter(job => job.endTime.getTime() > nowTime)
      .reduce<Production>(
        (acc, job) => ({ ...acc, [job.productionType]: acc[job.productionType] + 1 }),
        { tier1: 0, tier2: 0, tier3: 0 }
      );

    return formatCurUpgradeCosts(addByKey(liveProduction, queuedUpgradeCountByTier));
  } finally {
    conn.release();
  }
};

const upgradeProduction = async ({
  client,
  pool,
  msg,
  userId,
  args: [productionType],
}: CommandHandlerArgs): Promise<string> => {
  if (R.isNil(productionType)) {
    return printCurUpgradeCosts(pool, userId);
  }

  const productionKey = productionNameToKey(productionType);
  if (R.isNil(productionKey)) {
    return `Usage: \`${cmd('ships')} upgrade <mine type>\``;
  }

  const res = await queueProductionJob(pool, userId, productionKey);
  return res.fold<string | Promise<string>>(async ({ completionTime, upgradingToTier }) => {
    const channel = msg.channel;
    if (channel.type === 0) {
      await setReminder(
        client,
        pool,
        {
          userId,
          notificationType: NotificationType.ProductionUpgrade,
          notificationPayload: `${productionKey}-${upgradingToTier}`,
          guildId: channel.guild.id,
          channelId: msg.channel.id,
          reminderTime: completionTime,
        },
        await dbNow(pool)
      );
    } else {
      console.warn(`Unable to send notifications in channel type \`${channel.type}\``);
    }

    return `Upgrade queued!  Will complete ${dayjs(await dbNow(pool)).to(dayjs(completionTime))}`;
  }, R.prop('errorReason'));
};

const buildFleet = async ({
  client,
  msg,
  args,
  userId,
  pool,
}: CommandHandlerArgs): Promise<string> => {
  const [rawShipType, rawCount] = args;
  const shipType = Option.of(rawShipType)
    .map(buildableShipNameToKey)
    .orNull();
  const count = +rawCount;

  if (R.isNil(shipType) || R.isNil(rawCount) || Number.isNaN(count)) {
    return `Usage: \`-s build <ship type> <count>\``;
  }

  const conn = await getConn(pool);
  try {
    return queueFleetProduction(client, msg, conn, userId, shipType, count);
  } catch (err) {
    console.error('Error while building fleet: ', err);
    return 'Error while queueing fleet for production';
  } finally {
    conn.release();
  }
};

const CommandHandlers: {
  [command: string]: (args: CommandHandlerArgs) => Promise<string | string[]>;
} = {
  f: printCurFleet,
  fleet: printCurFleet,
  build: buildFleet,
  bal: printCurBalances,
  balance: printCurBalances,
  balances: printCurBalances,
  prod: printCurProduction,
  production: printCurProduction,
  up: upgradeProduction,
  upgrade: upgradeProduction,
};

export const maybeHandleCommand = ({
  splitContent,
  ...params
}: {
  client: Eris.Client;
  pool: mysql.Pool;
  msg: Eris.Message;
  userId: string;
  splitContent: string[];
}): undefined | Promise<string | string[]> => {
  const [command, ...args] = splitContent;
  const handler = CommandHandlers[command];
  if (!handler) {
    return;
  }

  return handler({ ...params, args });
};
