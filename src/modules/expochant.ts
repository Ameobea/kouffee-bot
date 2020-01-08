
export const pingExpochant = async (msg: string): Promise<string[]>=> {
    let msgParts = msg.split(' ');
    console.log(msgParts[1]);
    if(msgParts.length > 1)
        if(!Number(msgParts[1] && Number(msgParts[1]) < 50))
            return [`Usage: -expochant <number of pings, less than 50>`];
        else
            return Array(Number(msgParts[1])).fill(`<@165985005200211969>`);
    else
        return [`<@165985005200211969>`];
}