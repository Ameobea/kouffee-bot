export const pingExpochant = async (msg: string): Promise<string[]> => {
  const msgParts = msg.split(' ');
  if (msgParts.length > 1)
    if (!Number(msgParts[1] && Number(msgParts[1]) < 50))
      return [`Usage: -expochant <number of pings, less than 50>`];
    else return Array(Number(msgParts[1])).fill(`<@165985005200211969>`);
  else return [`<@165985005200211969>`];
};
