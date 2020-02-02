import * as R from 'ramda';
import mysql from 'mysql';
import { Either, Option } from 'funfix-core';
import { UnimplementedError } from 'ameo-utils/dist/util';

import { query, update, commit, dbNow, insert, getConn } from '../../dbUtil';
import { Fleet, buildDefaultFleet, BuildableShip, FleetJob } from './fleet';
import {
  Production,
  buildDefaultProduction,
  ProductionJobType,
  ProductionJob,
  Balances,
  buildDefaultBalances,
  getHasSufficientBalance,
  computeLiveUserProductionAndBalances,
  subtractBalances,
} from './economy';
import { ProductionUpgradeCostGetters } from './economy/curves/productionUpgrades';
import { CONF } from '../../conf';

export const TableNames = {
  Fleet: 'ships_fleets',
  /**
   * Keeps track of fleet production tasks that have been queued.
   */
  FleetJobs: 'ships_fleets-jobs',
  Production: 'ships_production',
  /**
   * Keeps track of economy upgrade tasks that have been queued.
   */
  ProductionJobs: 'ships_production-jobs',
  Notifications: 'ships_notifications',
} as const;

const setFleet = (
  conn: mysql.PoolConnection,
  userId: string,
  { ship1, ship2, ship3, ship4, shipSpecial1 }: Fleet
) =>
  update(
    conn,
    `INSERT INTO ${TableNames.Fleet}
    (userId, ship1, ship2, ship3, ship4, shipSpecial1, checkpointTime)
    VALUES (?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
    ship1=?, ship2=?, ship3=?, ship4=?, shipSpecial1=?, checkpointTime=NOW()`,
    [userId, ship1, ship2, ship3, ship4, shipSpecial1, ship1, ship2, ship3, ship4, shipSpecial1]
  );

const setProductionAndBalances = (
  conn: mysql.PoolConnection,
  userId: string,
  { tier1: tier1Prod, tier2: tier2Prod, tier3: tier3Prod }: Production,
  { tier1: tier1Bal, tier2: tier2Bal, tier3: tier3Bal, special1: special1Bal }: Balances
) =>
  update(
    conn,
    `INSERT INTO ${TableNames.Production}
    (userId, tier1Prod, tier2Prod, tier3Prod, tier1Bal, tier2Bal, tier3Bal, special1Bal, checkpointTime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
    tier1Prod=?, tier2Prod=?, tier3Prod=?, tier1Bal=?, tier2Bal=?, tier3Bal=?, special1Bal=?, checkpointTime=NOW()`,
    [
      userId,
      tier1Prod,
      tier2Prod,
      tier3Prod,
      tier1Bal,
      tier2Bal,
      tier3Bal,
      special1Bal,
      tier1Prod,
      tier2Prod,
      tier3Prod,
      tier1Bal,
      tier2Bal,
      tier3Bal,
      special1Bal,
    ]
  );

/**
 * Returns the current fleet for a given user.  If the user doesn't have any DB state for their fleet, it will be initialized
 * with an empty fleet.
 */
export const getUserFleetState = async (
  conn: mysql.PoolConnection,
  userId: string
): Promise<{
  fleet: Fleet & { checkpointTime: Date; userId: string };
  fleetJobsEndingAfterCheckpointTime: FleetJob[];
}> =>
  new Promise((resolve, reject) => {
    conn.beginTransaction(async err => {
      if (err) {
        reject(err);
        return;
      }

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

      await commit(conn);
      resolve({ fleet: fleetRes, fleetJobsEndingAfterCheckpointTime: fleetJobs });
    });
  });

export const queueFleetJob = async (
  shipType: BuildableShip,
  shipCount: number
): Promise<Either<{ completionTime: Date }, { errorReason: string }>> => {
  throw new UnimplementedError(); // TODO
};

const getLastQueuedProductionJob = (
  conn: mysql.PoolConnection,
  userId: string
): Promise<ProductionJob | undefined> =>
  query<ProductionJob>(
    conn,
    `SELECT * FROM \`${TableNames.ProductionJobs}\` WHERE userId = ? ORDER BY endTime DESC LIMIT 1;`,
    [userId]
  ).then(R.head);

const insertProductionJob = (
  conn: mysql.PoolConnection,
  userId: string,
  { jobType, productionType, startTime, endTime }: ProductionJob
) =>
  insert(
    conn,
    `INSERT INTO \`${TableNames.ProductionJobs}\` (userId, jobType, startTime, endTime, productionType) VALUES (?, ?, ?, ?, ?);`,
    [userId, jobType, startTime, endTime, productionType]
  );

export const queueProductionJob = async (
  pool: mysql.Pool,
  userId: string,
  productionType: keyof Production
): Promise<Either<{ completionTime: Date; upgradingToTier: number }, { errorReason: string }>> => {
  const conn = await getConn(pool);

  try {
    return await new Promise((resolve, reject) => {
      conn.beginTransaction(async err => {
        if (err) {
          reject(err);
          return;
        }

        const now = await dbNow(conn);
        const nowTime = now.getTime();

        const {
          checkpointTime,
          balances,
          production: snapshottedProduction,
          productionJobsEndingAfterCheckpointTime,
        } = await getUserProductionAndBalancesState(conn, userId);

        const {
          balances: liveBalances,
          production: liveProduction,
        } = computeLiveUserProductionAndBalances(
          now,
          checkpointTime,
          balances,
          snapshottedProduction,
          productionJobsEndingAfterCheckpointTime
        );

        // We find what level the user's production will be upgraded to after finishing the current upgrade queue so that
        // we appropriately charge the user for the tier after that.
        const maxQueuedUpgradeTier =
          liveProduction[productionType] +
          productionJobsEndingAfterCheckpointTime
            // Only care about upgrade jobs for the production type currently being upgraded
            .filter(R.propEq('productionType', productionType))
            // Only care about jobs that haven't been accounted for when computing live production and balances
            .filter(job => job.endTime.getTime() > nowTime).length;

        const { cost: upgradeCost, timeMs: upgradeTimeMs } = ProductionUpgradeCostGetters[
          productionType
        ](maxQueuedUpgradeTier);
        const insufficientResourceTypes = getHasSufficientBalance(upgradeCost, liveBalances);
        if (insufficientResourceTypes) {
          conn.rollback();
          resolve(
            Either.right({
              errorReason: `Insufficient resources of types: ${insufficientResourceTypes
                .map((key: keyof Balances) => CONF.ships.resource_names[key])
                .join(', ')}`,
            })
          );
          return;
        }

        // Compute start and end time of the upgrade
        const startTime = Option.of(await getLastQueuedProductionJob(conn, userId))
          .map(R.prop('endTime'))
          .map(d => d.getTime())
          .filter(endTime => endTime > nowTime)
          .getOrElse(nowTime);
        const endTime = startTime + upgradeTimeMs;

        // Debit the user's balance for the upgrade cost
        const newBalances = subtractBalances(liveBalances, upgradeCost);
        if (Object.values(newBalances).find(bal => bal < 0)) {
          console.error('ERROR: got negative balances somehow!!!');
          conn.rollback();
          reject();
          return;
        }
        await setProductionAndBalances(conn, userId, liveProduction, newBalances);

        // Queue the production job
        const job: ProductionJob = {
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          jobType: ProductionJobType.UpdgradeProduction,
          productionType,
        };
        await insertProductionJob(conn, userId, job);

        await commit(conn);
        resolve(
          Either.left({
            completionTime: new Date(endTime),
            upgradingToTier: liveProduction[productionType] + 1,
          })
        );
      });
    });
  } finally {
    conn.release();
  }
};

/**
 * Returns the current production state for the given user.  If no DB entries exist for it, initial state
 * will be inserted.
 */
export const getUserProductionAndBalancesState = async (
  conn: mysql.PoolConnection,
  userId: string
) =>
  new Promise<{
    checkpointTime: Date;
    balances: Balances;
    production: Production;
    productionJobsEndingAfterCheckpointTime: ProductionJob[];
  }>((resolve, reject) => {
    conn.beginTransaction(async err => {
      if (err) {
        reject(err);
        return;
      }

      let [productionRes] = await query<{
        tier1Prod: number;
        tier2Prod: number;
        tier3Prod: number;
        tier1Bal: number;
        tier2Bal: number;
        tier3Bal: number;
        special1Bal: number;
        userId: string;
        checkpointTime: Date;
      }>(conn, `SELECT * FROM \`${TableNames.Production}\` WHERE userId = ?;`, [userId]);
      if (R.isNil(productionRes)) {
        const production = buildDefaultProduction();
        const balances = buildDefaultBalances();
        productionRes = {
          ...Object.fromEntries(
            Object.entries(production).map(([key, val]) => [key + 'Prod', val])
          ),
          ...Object.fromEntries(Object.entries(balances).map(([key, val]) => [key + 'Bal', val])),
          checkpointTime: await dbNow(conn),
          userId,
        } as any;
        await setProductionAndBalances(conn, userId, production, balances);
      }

      const productionJobs = await query<{
        userId: string;
        jobType: ProductionJobType;
        startTime: Date;
        endTime: Date;
        productionType: keyof Production;
      }>(conn, `SELECT * FROM \`${TableNames.ProductionJobs}\` WHERE userId = ? AND endTime > ?;`, [
        userId,
        productionRes.checkpointTime,
      ]);

      await commit(conn);
      resolve({
        checkpointTime: productionRes.checkpointTime,
        production: Object.fromEntries(
          Object.entries(productionRes)
            .filter(([key]) => key.includes('Prod'))
            .map(([key, val]) => [key.replace('Prod', ''), val])
        ) as any,
        balances: Object.fromEntries(
          Object.entries(productionRes)
            .filter(([key]) => key.includes('Bal'))
            .map(([key, val]) => [key.replace('Bal', ''), val])
        ) as any,
        productionJobsEndingAfterCheckpointTime: productionJobs,
      });
    });
  });
