import fetch from 'node-fetch';

export const getRandomOSRSLink = async () =>
  fetch('https://oldschool.runescape.wiki/w/Special:Random/main', {
    headers: { 'user-agent': 'curl/7.72.0' },
    redirect: 'manual',
  }).then(res => res.headers.get('location'));
