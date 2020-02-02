import * as R from 'ramda';
import mysql from 'mysql';
import numeral from 'numeral';
import dayjs from 'dayjs';
import { Option } from 'funfix-core';
import { UnimplementedError } from 'ameo-utils/dist/util';

import { getUserFleetState, getUserProductionAndBalancesState, queueProductionJob } from './db';
import { Fleet, computeLiveFleet } from './fleet';
import { dbNow, getConn } from '../../dbUtil';
import { CONF } from '../../conf';
import { cmd } from '../..';
import { computeLiveUserProductionAndBalances, Balances, Production } from './economy';
import { ProductionIncomeGetters } from './economy/curves/production';

const fmtCount = (shipCount: number): string => numeral(shipCount).format('1,000');

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

const formatProduction = (production: Production): string => `
\`\`\`
${CONF.ships.resource_names['tier1']} Mine: Level ${fmtCount(production.tier1)} (${numeral(
  ProductionIncomeGetters.tier1(production.tier1, 1000)
).format('1,000.0')}/sec)
${CONF.ships.resource_names['tier2']} Mine: Level ${fmtCount(production.tier2)} (${numeral(
  ProductionIncomeGetters.tier2(production.tier2, 1000)
).format('1,000.0')}/sec)
${CONF.ships.resource_names['tier3']} Mine: Level ${fmtCount(production.tier3)} (${numeral(
  ProductionIncomeGetters.tier3(production.tier3, 1000)
).format('1,000.0')}/sec)
\`\`\`
`;

const printCurFleet = async (pool: mysql.Pool, userId: string) => {
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

const printCurBalances = async (pool: mysql.Pool, userId: string): Promise<string> => {
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

const printCurProduction = async (pool: mysql.Pool, userId: string): Promise<string> => {
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

    return formatProduction(liveProduction);
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

const upgradeProduction = async (
  pool: mysql.Pool,
  userId: string,
  [productionType = '']: string[]
): Promise<string> => {
  const productionKey = productionNameToKey(productionType);
  if (R.isNil(productionKey)) {
    return `Usage: \`${cmd('ships')} upgrade <mine type>\``;
  }

  const res = await queueProductionJob(pool, userId, productionKey);
  return res.fold<string | Promise<string>>(
    async ({ completionTime }) =>
      `Upgrade queued!  Will complete in: ${dayjs(await dbNow(pool)).to(dayjs(completionTime))}`,
    ({ errorReason }) => {
      console.log({ errorReason });
      return errorReason;
    }
  );
};

const buildShips = (pool: mysql.Pool, userId: string) => {
  throw new UnimplementedError();
};

const CommandHandlers: {
  [command: string]: (
    pool: mysql.Pool,
    userId: string,
    args: string[]
  ) => Promise<string | string[]>;
} = {
  fleet: printCurFleet,
  balance: printCurBalances,
  balances: printCurBalances,
  production: printCurProduction,
  upgrade: upgradeProduction,
  build: buildShips,
};

export const maybeHandleCommand = (
  pool: mysql.Pool,
  userId: string,
  [command, ...args]: string[]
): undefined | Promise<string | string[]> => {
  const handler = CommandHandlers[command];
  if (!handler) {
    return;
  }

  return handler(pool, userId, args);
};
