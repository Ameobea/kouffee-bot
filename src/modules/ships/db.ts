import * as R from 'ramda';
import mysql from 'mysql';
import { Either, Option } from 'funfix-core';

import { query, update, commit, dbNow, insert, getConn } from 'src/dbUtil';
import { formatInsufficientResourceTypes } from 'src/modules/ships/formatters';
import {
  Fleet,
  buildDefaultFleet,
  BuildableShip,
  FleetJob,
  FleetJobRow,
  FleetJobType,
} from './fleet';
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
import { Item } from './inventory/item';
import { RaidLocation } from './raids';

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
  Inventory: 'ships_inventory',
  InventoryMetadata: 'ships_inventory-metadata',
  Raids: 'ships_raids',
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

export const setProductionAndBalances = (
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

export interface QueueFleetJobParams {
  conn: mysql.Pool | mysql.PoolConnection;
  userId: string;
  shipType: BuildableShip;
  shipCount: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Returns all fleet jobs for the specified user that finish after the specified time.
 */
export const getAllPendingOrRunningFleetJobs = async (
  conn: mysql.Pool | mysql.PoolConnection,
  userId: string,
  endTime: Date
): Promise<FleetJobRow[]> =>
  query<FleetJobRow>(
    conn,
    `SELECT * FROM \`${TableNames.FleetJobs}\` WHERE userId = ? AND endTime > ?;`,
    [userId, endTime]
  );

export const queueFleetJob = async ({
  conn,
  userId,
  shipType,
  shipCount,
  startTime,
  endTime,
}: QueueFleetJobParams) => {
  const row: FleetJobRow = {
    userId,
    jobType: FleetJobType.BuildShip,
    startTime,
    endTime,
    shipType,
    shipCount,
  };
  return insert(
    conn,
    `INSERT INTO \`${TableNames.FleetJobs}\` (userId, jobType, startTime, endTime, shipType, shipCount) VALUES (?, ?, ?, ?, ?, ?);`,
    [row.userId, row.jobType, row.startTime, row.endTime, row.shipType, row.shipCount]
  );
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
              errorReason: formatInsufficientResourceTypes(insufficientResourceTypes),
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
            upgradingToTier: maxQueuedUpgradeTier + 1,
          })
        );
      });
    });
  } finally {
    conn.release();
  }
};

export const getInventoryForPlayer = async (
  conn: mysql.Pool | mysql.PoolConnection,
  userId: string
): Promise<Item[]> =>
  query(
    conn,
    `SELECT \`${TableNames.Inventory}\`.itemId, \`${TableNames.Inventory}\`.count, \`${TableNames.Inventory}\`.tier, \`${TableNames.InventoryMetadata}\`.data
    FROM \`${TableNames.Inventory}\`
    LEFT JOIN \`${TableNames.InventoryMetadata}\` ON \`${TableNames.Inventory}\`.metadataKey = \`${TableNames.InventoryMetadata}\`.id
    WHERE userId = ?;`,
    [userId]
  ).then(rows =>
    rows.map(
      ({
        itemId,
        count,
        tier,
        data,
      }: {
        itemId: number;
        count: number;
        tier: number | null;
        data: string | null;
      }): Item => ({ id: itemId, count, tier: R.isNil(tier) ? undefined : tier, metadata: data })
    )
  );

export enum RaidDurationTier {
  Short,
  Medium,
  Long,
}

export interface RaidRow extends Fleet {
  userId: string;
  durationTier: RaidDurationTier;
  location: RaidLocation;
  departureTime: Date;
  returnTime: Date;
}

export const insertRaid = async (
  conn: mysql.Pool | mysql.PoolConnection,
  {
    userId,
    durationTier,
    location,
    departureTime,
    returnTime,
    ship1,
    ship2,
    ship3,
    ship4,
    shipSpecial1,
  }: RaidRow
) =>
  insert(
    conn,
    `INSERT INTO \`${TableNames.Raids}\`
    (userId, durationTier, location, departureTime, returnTime, ship1, ship2, ship3, ship4, shipSpecial1)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      userId,
      durationTier,
      location,
      departureTime,
      returnTime,
      ship1,
      ship2,
      ship3,
      ship4,
      shipSpecial1,
    ]
  );

export const getActiveRaid = async (
  conn: mysql.Pool | mysql.PoolConnection,
  userId: string
): Promise<Option<RaidRow>> =>
  query<RaidRow>(
    conn,
    `SELECT * FROM \`${TableNames.Raids}\` WHERE userId = ? AND returnTime < NOW();`,
    [userId]
  ).then(([row]) => Option.of(row));
