import Eris from 'eris';
import mysql from 'mysql';

import { initTimers } from './scheduler.js';
export { maybeHandleCommand } from './commands';

export const init = async (client: Eris.Client, conn: mysql.Pool): Promise<void> => {
  await initTimers(client, conn);
};
