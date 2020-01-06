import Eris from 'eris';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('`DISCORD_TOKEN` environment variable must be supplied');
}

const client = Eris(token);

const getResponse = (msg: string): string | undefined | null => {
  const lowerMsg = msg.toLowerCase();

  if (lowerMsg.startsWith('!kouffee')) {
    return 'https://ameo.link/u/6zv.jpg';
  }
};

client.on('messageCreate', msg => {
  if (!msg.cleanContent) {
    return;
  }

  const res = getResponse(msg.cleanContent);
  if (res) {
    client.createMessage(msg.channel.id, res);
  }
});

client.on('connect', () => console.log('Bot connected!'));

client.on('error', err => console.error(err));

client.connect();
