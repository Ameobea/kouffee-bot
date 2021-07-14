import mysql from 'mysql';

export const getServerDate = async (_conn: mysql.Pool | mysql.PoolConnection) => {
  const now = new Date();
  return `Current time on the server: ${now.toLocaleString()}`;
};
