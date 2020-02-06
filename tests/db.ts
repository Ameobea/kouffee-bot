import mysql from 'mysql';

const TEST_USER_DISCORD_ID_1 = '1001' as const;
const TEST_USER_DISCORD_ID_2 = '1002' as const;

import { createConnPool, _delete, query, dbNow } from '../src/dbUtil';
import { loadConf } from '../src/conf';
import {
  TableNames,
  insertRaid,
  RaidDurationTier,
  RaidRow,
  connAndTransact,
  transact,
} from '../src/modules/ships/db';
import { timeout } from '../src/util';
import { RaidLocation } from '../src/modules/ships/raids';
import { buildDefaultFleet } from '../src/modules/ships/fleet';

let pool: mysql.Pool;

const deleteAllTestRows = async () => {
  await _delete(pool, `DELETE FROM \`${TableNames.Raids}\` WHERE userId IN (?);`, [
    TEST_USER_DISCORD_ID_1,
    TEST_USER_DISCORD_ID_2,
  ]);
};

describe('Race Condition Prevention', () => {
  beforeAll(async () => {
    const conf = await loadConf();
    pool = createConnPool(conf);
    await deleteAllTestRows();
  });

  afterAll(async () => {
    // Clear all test rows out
    await deleteAllTestRows();

    await new Promise(resolve => pool.end(resolve));
  });

  it('Properly locks the full raids table for users when queueing raids', async () => {
    let indiciateInitialSelectComplete: () => void;
    const initialSelectComplete = new Promise(resolve => {
      indiciateInitialSelectComplete = resolve;
    });

    // First connection/transaction; looks at DB state and waits a long time before inserting.
    const transaction1 = connAndTransact(
      pool,
      TEST_USER_DISCORD_ID_1,
      async (conn: mysql.PoolConnection) => {
        console.log('Starting first select');
        const [existingRaid] = await query<RaidRow>(
          conn,
          `SELECT * FROM \`${TableNames.Raids}\` WHERE userId = ?;`,
          [TEST_USER_DISCORD_ID_1]
        );
        // We've not inserted anything yet
        expect(existingRaid).toBeFalsy();

        // Indicate that we've finished our initial insert, so the second transaction can try to access these
        // rows now.
        console.log('Finished first select');
        indiciateInitialSelectComplete();

        // Wait a long time, giving the other transaction a chance to try to look at the db state,
        // see nothing, and insert a row.  This shouldn't be possible since we should have acquired
        // a lock on all rows for `userId = TEST_USER_DISCORD_ID`.
        await timeout(1500);

        console.log('Starting insert');
        await insertRaid(pool, {
          ...buildDefaultFleet(),
          userId: TEST_USER_DISCORD_ID_1,
          durationTier: RaidDurationTier.Short,
          location: RaidLocation.Location1,
          departureTime: new Date(),
          returnTime: new Date(),
        });
        console.log('Finished insert');
      }
    );

    // Second transaction.  We try to look for existing user rows and insert if none are found right away.
    const transaction2 = connAndTransact(
      pool,
      TEST_USER_DISCORD_ID_1,
      async (conn: mysql.PoolConnection) => {
        // Wait for the first transaction to begin and (hopefully) lock the users' rows in the table before
        // allowing this one to try selecting
        console.log('Started second conn; waiting for first select to finish.');
        await initialSelectComplete;

        // Look for any raids that are from the discord user
        console.log('First select finished; starting second select');
        const [existingRaid] = await query<RaidRow>(
          conn,
          `SELECT * FROM \`${TableNames.Raids}\` WHERE userId = ?;`,
          [TEST_USER_DISCORD_ID_1]
        );
        console.log('Finished second select');
        // We expect the first transaction to have complete already while blocking us in the meantime
        expect(existingRaid).toBeTruthy();
      }
    );

    await Promise.all([transaction1, transaction2]).catch(err => {
      console.error(err);
      throw err;
    });
  });

  it('Should deal with nested transactions', async () => {
    const now = await connAndTransact(pool, TEST_USER_DISCORD_ID_2, async conn =>
      transact(conn, TEST_USER_DISCORD_ID_2, async conn => dbNow(conn))
    );
    expect(now).toBeInstanceOf(Date);
  });
});
