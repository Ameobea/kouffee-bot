import * as R from 'ramda';
import mysql from 'mysql';
import { Either, Option } from 'funfix-core';

import { query, update, commit, dbNow, insert, getConn, rollback, _delete } from 'src/dbUtil';
import { formatInsufficientResourceTypes } from 'src/modules/ships/formatters';
import { Fleet, BuildableShip, FleetJobRow, FleetJobType, FleetTransactionRow } from './fleet';
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
import { RaidLocation, RaidDurationTier } from './raids/types';
import { InventoryTransactionRow, dedupInventory } from './inventory';

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
  InventoryCheckpointTime: 'ships_inventory-checkpointTime',
  InventoryMetadata: 'ships_inventory-metadata',
  Raids: 'ships_raids',
  UserLocks: 'ships_userLocks',
  InventoryTransactions: 'ships_inventory-transactions',
  FleetTransactions: 'ships_fleet-transactions',
} as const;

/**
 * Obtains a lock on the row for a user from the lock synchronization table.  The idea is that it will produce an
 * exclusive lock which prevents any other updates to any of the user's data until after it's released.
 */
export const lockUser = (conn: mysql.PoolConnection, userId: string) =>
  update(
    conn,
    `INSERT INTO \`${TableNames.UserLocks}\` (userId) VALUES (?) ON DUPLICATE KEY UPDATE userId=?`,
    [userId, userId]
  );

export const transact = <T>(
  conn: mysql.PoolConnection,
  userId: string,
  cb: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    conn.beginTransaction(async err => {
      if (err) {
        reject(err);
        return;
      }

      try {
        // Lock the user's row to ensure exclusive access to *everything* for the duration of this transaction
        await lockUser(conn, userId);
        const res = await cb(conn);
        await commit(conn);
        resolve(res);
      } catch (err) {
        reject(err);
        await rollback(conn);
      }
    });
  });

export const connAndTransact = async <T>(
  pool: mysql.Pool,
  userId: string,
  cb: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> => {
  const conn = await getConn(pool);

  try {
    return await transact(conn, userId, cb);
  } catch (err) {
    throw err;
  } finally {
    conn.release();
  }
};

export const setFleet = (
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

export interface QueueFleetJobParams {
  conn: mysql.Pool | mysql.PoolConnection;
  userId: string;
  shipType: BuildableShip;
  shipCount: bigint;
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

export interface UserProductionAndBalancesState {
  checkpointTime: Date;
  balances: Balances;
  production: Production;
  productionJobsEndingAfterCheckpointTime: ProductionJob[];
}

/**
 * Returns the current production state for the given user.  If no DB entries exist for it, initial state
 * will be inserted.
 */
export const getUserProductionAndBalancesState = async (
  conn: mysql.PoolConnection,
  userId: string
) =>
  transact<UserProductionAndBalancesState>(conn, userId, async conn => {
    let [productionRes] = await query<{
      tier1Prod: number;
      tier2Prod: number;
      tier3Prod: number;
      tier1Bal: string;
      tier2Bal: string;
      tier3Bal: string;
      special1Bal: string;
      userId: string;
      checkpointTime: Date;
    }>(conn, `SELECT * FROM \`${TableNames.Production}\` WHERE userId = ?;`, [userId]);
    if (R.isNil(productionRes)) {
      const production = buildDefaultProduction();
      const balances = buildDefaultBalances();
      productionRes = {
        ...Object.fromEntries(Object.entries(production).map(([key, val]) => [key + 'Prod', val])),
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
    return {
      checkpointTime: productionRes.checkpointTime,
      production: Object.fromEntries(
        Object.entries(productionRes)
          .filter(([key]) => key.includes('Prod'))
          .map(([key, val]) => [key.replace('Prod', ''), val])
      ) as any,
      balances: Object.fromEntries(
        Object.entries(productionRes)
          .filter(([key]) => key.includes('Bal'))
          .map(([key, val]) => [key.replace('Bal', ''), BigInt(val)])
      ) as any,
      productionJobsEndingAfterCheckpointTime: productionJobs,
    };
  });

export const queueProductionJob = async (
  pool: mysql.Pool,
  userId: string,
  productionType: keyof Production
) =>
  connAndTransact<
    Either<{ completionTime: Date; upgradingToTier: number }, { errorReason: string }>
  >(pool, userId, async conn => {
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
      throw Either.right({
        errorReason: formatInsufficientResourceTypes(insufficientResourceTypes),
      });
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
      throw new Error('Got negative balances somehow!!!');
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

    return Either.left({
      completionTime: new Date(endTime),
      upgradingToTier: maxQueuedUpgradeTier + 1,
    });
  }).catch(err => {
    if (err instanceof Either) {
      return err as Either<
        { completionTime: Date; upgradingToTier: number },
        { errorReason: string }
      >;
    }
    throw err;
  });

export const getInventoryCheckpointTime = (
  conn: mysql.Pool | mysql.PoolConnection,
  userId: string
): Promise<Date | null> =>
  query<{ userId: string; checkpointTime: Date }>(
    conn,
    `SELECT * FROM \`${TableNames.InventoryCheckpointTime}\` WHERE userId = ?;`,
    [userId]
  ).then(([row]: { userId: string; checkpointTime: Date }[]) =>
    Option.of(row)
      .map(R.prop('checkpointTime'))
      .orNull()
  );

export const insertInventoryTransactions = (
  conn: mysql.Pool | mysql.PoolConnection,
  invTransactions: InventoryTransactionRow[]
) =>
  insert(
    conn,
    `INSERT INTO \`${TableNames.InventoryTransactions}\` (userId, applicationTime, itemId, count, metadataKey, tier) VALUES ?`,
    [
      invTransactions.map(({ userId, applicationTime, itemId, count, metadataKey, tier }) => [
        userId,
        applicationTime,
        itemId,
        count,
        metadataKey,
        tier,
      ]),
    ]
  );

export const insertFleetTransactions = (
  conn: mysql.Pool | mysql.PoolConnection,
  fleetTransactions: FleetTransactionRow[]
) =>
  insert(
    conn,
    `INSERT INTO \`${TableNames.FleetTransactions}\` (userId, applicationTime, ship1, ship2, ship3, ship4, shipSpecial1) VALUES ?;`,
    [
      fleetTransactions.map(
        ({ userId, applicationTime, ship1, ship2, ship3, ship4, shipSpecial1 }) => [
          userId,
          applicationTime,
          ship1,
          ship2,
          ship3,
          ship4,
          shipSpecial1,
        ]
      ),
    ]
  );

export const getInventoryForPlayer = async (
  conn: mysql.Pool | mysql.PoolConnection,
  userId: string
): Promise<Item[]> => {
  const inventoryCheckpointTime = await getInventoryCheckpointTime(conn, userId);
  const items = await query(
    conn,
    `SELECT \`${TableNames.Inventory}\`.itemId, \`${TableNames.Inventory}\`.count, \`${TableNames.Inventory}\`.tier, \`${TableNames.InventoryMetadata}\`.data, \`${TableNames.Inventory}\`.metadataKey
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
        metadataKey,
      }: {
        itemId: number;
        count: string;
        tier: number | null;
        data: string | null;
        metadataKey: string | null;
      }): Item & { metadataKey: string | null } => ({
        id: itemId,
        count: BigInt(count),
        tier: R.isNil(tier) ? undefined : tier,
        metadata: data,
        metadataKey,
      })
    )
  );

  const inventoryTransactionsToApply: (InventoryTransactionRow & {
    metadata: any | null;
  })[] = await query<InventoryTransactionRow & { data: string | null }>(
    conn,
    `SELECT *
    FROM \`${TableNames.InventoryTransactions}\`
    LEFT JOIN \`${TableNames.InventoryMetadata}\` ON \`${TableNames.InventoryTransactions}\`.metadataKey = \`${TableNames.InventoryMetadata}\`.id
    WHERE userId = ? AND applicationTime > ? AND applicationTime <= NOW();`,
    [userId, inventoryCheckpointTime || 0]
  ).then(rows =>
    rows.map(({ data, count, ...rest }) => ({
      ...rest,
      metadata: data ? JSON.parse(data) : null,
      count: BigInt(count),
    }))
  );

  return dedupInventory([
    ...items,
    ...inventoryTransactionsToApply.map(transaction => ({
      ...transaction,
      id: transaction.itemId,
    })),
  ]);
};

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
    `SELECT * FROM \`${TableNames.Raids}\` WHERE userId = ? AND returnTime > NOW();`,
    [userId]
  ).then(([row]) => Option.of(row));

export const getApplicableFleetTransactions = async (
  conn: mysql.Pool | mysql.PoolConnection,
  fleetCheckpointTime: Date | null,
  userId: string
): Promise<FleetTransactionRow[]> =>
  query<FleetTransactionRow>(
    conn,
    `SELECT * FROM \`${TableNames.FleetTransactions}\` WHERE userId = ? AND applicationTime > ? AND applicationTime <= NOW();`,
    [userId, fleetCheckpointTime || 0]
  );

const setInventoryCheckpointForPlayer = (conn: mysql.Pool | mysql.PoolConnection, userId: string) =>
  insert(
    conn,
    `INSERT INTO \`${TableNames.InventoryCheckpointTime}\` (userId, checkpointTime) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE checkpointTime=NOW();`,
    [userId]
  );

export const setInventoryForPlayer = (
  conn: mysql.PoolConnection,
  inventory: Item[],
  userId: string
) =>
  transact(conn, userId, async conn => {
    await setInventoryCheckpointForPlayer(conn, userId);
    await _delete(conn, `DELETE FROM \`${TableNames.InventoryCheckpointTime}\` WHERE userId = ?;`, [
      userId,
    ]);
    // TODO: Deal with the metadata if we ever actually use that.
    await insert(
      conn,
      `INSERT INTO \`${TableNames.Inventory}\` (userId, itemId, count, metadataKey, tier) VALUES ?;`,
      [inventory.map(item => [userId, item.id, item.count, null, item.tier])]
    );
  });
